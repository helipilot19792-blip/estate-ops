import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type ServiceClient = any;

type ConflictCandidate = {
  id: string;
  organization_id: string;
  property_id: string;
  scheduled_for: string | null;
  notes: string | null;
  schedule_conflict_at: string | null;
  accepted_at: string | null;
};

function checkoutDateFromNotes(notes: string | null) {
  return notes?.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] || null;
}

function jobDate(job: Pick<ConflictCandidate, "scheduled_for" | "notes">) {
  return job.scheduled_for || checkoutDateFromNotes(job.notes);
}

/**
 * Detects only real deadline conflicts: two or more accepted jobs for one cleaner,
 * on one date, where each property now has an incoming guest that day. Since the
 * product does not yet store travel or duration estimates, the latest-accepted job
 * is the transparent fallback recommendation to reassign.
 */
export async function detectSameDayCleanerConflicts(service: ServiceClient, origin: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: acceptedSlots, error: slotsError } = await service
    .from("turnover_job_slots")
    .select("id, job_id, cleaner_account_id, accepted_at, status")
    .in("status", ["accepted", "in_progress"])
    .not("cleaner_account_id", "is", null);
  if (slotsError) throw new Error(slotsError.message);

  const slots = acceptedSlots ?? [];
  if (slots.length === 0) return { conflicts: 0, notificationsSent: 0, errors: [] as string[] };

  const jobIds = [...new Set(slots.map((slot: any) => slot.job_id).filter(Boolean))];
  const { data: jobsData, error: jobsError } = await service
    .from("turnover_jobs")
    .select("id, organization_id, property_id, scheduled_for, notes, schedule_conflict_at, accepted_at")
    .in("id", jobIds);
  if (jobsError) throw new Error(jobsError.message);

  const jobs = (jobsData ?? []) as ConflictCandidate[];
  const relevantJobs = jobs.filter((job) => (jobDate(job) || "") >= today);
  const propertyIds = [...new Set(relevantJobs.map((job) => job.property_id).filter(Boolean))];
  const dates = [...new Set(relevantJobs.map(jobDate).filter(Boolean))] as string[];
  if (propertyIds.length === 0 || dates.length === 0) return { conflicts: 0, notificationsSent: 0, errors: [] as string[] };

  const { data: bookings, error: bookingsError } = await service
    .from("property_booking_events")
    .select("property_id, checkin_date")
    .in("property_id", propertyIds)
    .in("checkin_date", dates);
  if (bookingsError) throw new Error(bookingsError.message);
  const arrivalKeys = new Set((bookings ?? []).map((booking: any) => `${booking.property_id}:${booking.checkin_date}`));

  const jobsById = new Map(relevantJobs.map((job) => [job.id, job]));
  const groups = new Map<string, Array<{ job: ConflictCandidate; slot: any }>>();
  for (const slot of slots) {
    const job = jobsById.get(slot.job_id);
    const date = job ? jobDate(job) : null;
    if (!job || !date || !arrivalKeys.has(`${job.property_id}:${date}`)) continue;
    const key = `${slot.cleaner_account_id}:${date}`;
    const group = groups.get(key) || [];
    group.push({ job, slot });
    groups.set(key, group);
  }

  const activeJobIds = new Set<string>();
  const newGroups: Array<{ key: string; rows: Array<{ job: ConflictCandidate; slot: any }> }> = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    rows.forEach(({ job }) => activeJobIds.add(job.id));
    if (rows.some(({ job }) => !job.schedule_conflict_at)) newGroups.push({ key, rows });
  }

  const previouslyFlaggedIds = jobs.filter((job) => job.schedule_conflict_at).map((job) => job.id);
  const resolvedIds = previouslyFlaggedIds.filter((id) => !activeJobIds.has(id));
  if (resolvedIds.length) {
    const { error } = await service
      .from("turnover_jobs")
      .update({ schedule_conflict_at: null, schedule_conflict_group_key: null, schedule_conflict_recommended: false, schedule_conflict_reason: null })
      .in("id", resolvedIds);
    if (error) throw new Error(error.message);
  }

  const errors: string[] = [];
  let notificationsSent = 0;
  for (const { key, rows } of newGroups) {
    const ranked = [...rows].sort((a, b) => String(b.slot.accepted_at || b.job.accepted_at || "").localeCompare(String(a.slot.accepted_at || a.job.accepted_at || "")));
    const recommendedJobId = ranked[0].job.id;
    const now = new Date().toISOString();
    for (const { job } of rows) {
      const { error } = await service
        .from("turnover_jobs")
        .update({
          schedule_conflict_at: now,
          schedule_conflict_group_key: key,
          schedule_conflict_recommended: job.id === recommendedJobId,
          schedule_conflict_reason: "A same-day guest arrival was added after accepted flexible cleanings.",
        })
        .eq("id", job.id);
      if (error) throw new Error(error.message);
    }

    const organizationId = rows[0].job.organization_id;
    const cleanerAccountId = rows[0].slot.cleaner_account_id;
    const [{ data: cleanerMembers, error: cleanerError }, { data: admins, error: adminError }] = await Promise.all([
      service.from("cleaner_account_members").select("profile_id").eq("cleaner_account_id", cleanerAccountId),
      service.from("organization_members").select("profile_id").eq("organization_id", organizationId).eq("role", "admin"),
    ]);
    if (cleanerError) errors.push(cleanerError.message);
    if (adminError) errors.push(adminError.message);
    const count = rows.length;
    const cleanerProfileIds = (cleanerMembers ?? []).map((member: any) => member.profile_id).filter(Boolean);
    const adminProfileIds = (admins ?? []).map((member: any) => member.profile_id).filter(Boolean);
    try {
      const [cleanerPush, adminPush] = await Promise.all([
        sendStaffPushNotifications("cleaner", cleanerProfileIds, {
          title: "Same-day cleaning conflict detected",
          body: `${count} accepted cleanings now have same-day guest arrivals. A backup cleaner is recommended.`,
          url: `${origin}/cleaner`,
          tag: `same-day-cleaner-conflict-${key}`,
        }),
        sendStaffPushNotifications("admin", adminProfileIds, {
          title: "Cleaner schedule conflict needs coverage",
          body: `${count} accepted cleanings now have same-day guest arrivals. Reassign the recommended job to a backup cleaner.`,
          url: `${origin}/admin`,
          tag: `same-day-cleaner-conflict-${key}`,
        }),
      ]);
      notificationsSent += cleanerPush.sent + adminPush.sent;
      errors.push(...cleanerPush.errors, ...adminPush.errors);
    } catch (pushError) {
      errors.push(pushError instanceof Error ? pushError.message : "Could not send conflict push notification.");
    }
  }

  return { conflicts: newGroups.length, notificationsSent, errors };
}
