import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";
import { sendJobOfferDigestEmailForSlots, sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";
import {
  getCleanerOfferExpiresAtForDailySweep,
  isCleanerJobDatePast,
} from "@/lib/server/cleaner-offer-deadlines";
import { loadPreviouslyDeclinedCleanerIds } from "@/lib/server/cleaner-training-rotation";
import { refreshJobStaffing } from "@/lib/server/job-email-actions";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  }
);

type ReleaseMode = "reoffer_to_backups" | "leave_unassigned";
type NotifyMode = "digest" | "immediate" | "none";

function extractCheckoutDate(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function getJobDate(job: any) {
  return job.scheduled_for || extractCheckoutDate(job.notes);
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return Response.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicSupabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !publicSupabaseKey) {
      return Response.json({ ok: false, error: "Missing Supabase auth environment variables." }, { status: 500 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return Response.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();
    const cleanerAccountId = body?.cleanerAccountId;
    const mode: ReleaseMode = body?.mode || "reoffer_to_backups";
    const notifyMode: NotifyMode =
      body?.notifyMode === "immediate" ? "immediate" : body?.notifyMode === "none" ? "none" : "digest";

    if (!cleanerAccountId) {
      return Response.json({ ok: false, error: "Missing cleanerAccountId" }, { status: 400 });
    }

    const { data: slots, error: slotError } = await supabase
      .from("turnover_job_slots")
      .select("*")
      .eq("cleaner_account_id", cleanerAccountId)
      .eq("status", "accepted");

    if (slotError) throw slotError;

    if (!slots || slots.length === 0) {
      return Response.json({
        ok: true,
        affected: 0,
        reoffered: 0,
        stranded: 0,
        notificationResult: null,
        message: "No accepted jobs found",
      });
    }

    const jobIds = [...new Set(slots.map((s) => s.job_id))];

    const { data: jobs, error: jobsError } = await supabase
      .from("turnover_jobs")
      .select("id, property_id, scheduled_for, notes")
      .in("id", jobIds);
    if (jobsError) throw jobsError;

    const jobsMap = new Map(jobs?.map((j) => [j.id, j]) || []);

    const { data: siblingSlots, error: siblingSlotsError } = await supabase
      .from("turnover_job_slots")
      .select("id, job_id, cleaner_account_id, status")
      .in("job_id", jobIds);
    if (siblingSlotsError) throw siblingSlotsError;
    const unavailableCleanerIdsByJobId = new Map<string, Set<string>>();
    for (const siblingSlot of siblingSlots ?? []) {
      if (!["offered", "accepted", "in_progress", "completed"].includes(String(siblingSlot.status || "").toLowerCase())) continue;
      if (!siblingSlot.cleaner_account_id) continue;
      const unavailableCleanerIds = unavailableCleanerIdsByJobId.get(siblingSlot.job_id) ?? new Set<string>();
      unavailableCleanerIds.add(siblingSlot.cleaner_account_id);
      unavailableCleanerIdsByJobId.set(siblingSlot.job_id, unavailableCleanerIds);
    }

    const futureSlots = slots.filter((slot) => {
      const job = jobsMap.get(slot.job_id);
      const jobDate = job ? getJobDate(job) : null;
      return jobDate && !isCleanerJobDatePast(jobDate);
    });

    if (futureSlots.length === 0) {
      return Response.json({
        ok: true,
        affected: 0,
        reoffered: 0,
        stranded: 0,
        notificationResult: null,
        message: "No future jobs found",
      });
    }

    const { data: cleanerAccount, error: cleanerAccountError } = await supabase
      .from("cleaner_accounts")
      .select("id, organization_id, display_name")
      .eq("id", cleanerAccountId)
      .maybeSingle();

    if (cleanerAccountError) throw cleanerAccountError;
    if (!cleanerAccount?.organization_id) {
      return Response.json({ ok: false, error: "Cleaner account not found." }, { status: 404 });
    }

    const { data: currentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!currentProfile || (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")) {
      return Response.json({ ok: false, error: "Admin access required." }, { status: 403 });
    }

    if (currentProfile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", cleanerAccount.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership) {
        return Response.json({ ok: false, error: "Admin access required for this organization." }, { status: 403 });
      }
    }

    const propertyIds = [...new Set(futureSlots.map((s) => jobsMap.get(s.job_id)?.property_id))];

    const { data: assignments, error: assignmentsError } = await supabase
      .from("property_cleaner_account_assignments")
      .select("*")
      .in("property_id", propertyIds)
      .order("priority", { ascending: true });
    if (assignmentsError) throw assignmentsError;

    const assignmentCleanerIds = [
      ...new Set((assignments || []).map((assignment) => assignment.cleaner_account_id).filter(Boolean)),
    ];
    const { data: assignmentCleanerAccounts, error: assignmentCleanerAccountsError } = assignmentCleanerIds.length
      ? await supabase.from("cleaner_accounts").select("id, display_name, active").in("id", assignmentCleanerIds)
      : { data: [], error: null };
    if (assignmentCleanerAccountsError) throw assignmentCleanerAccountsError;
    const cleanerNameById = new Map(
      (assignmentCleanerAccounts || []).map((account) => [account.id, account.display_name || null])
    );
    const activeCleanerIds = new Set(
      (assignmentCleanerAccounts || [])
        .filter((account) => account.active !== false)
        .map((account) => account.id)
    );

    const assignmentMap = new Map<string, any[]>();

    for (const a of assignments || []) {
      if (!activeCleanerIds.has(a.cleaner_account_id)) continue;
      if (!assignmentMap.has(a.property_id)) {
        assignmentMap.set(a.property_id, []);
      }
      assignmentMap.get(a.property_id)!.push(a);
    }

    let reoffered = 0;
    let stranded = 0;
    let skippedBecauseChanged = 0;
    const reofferedSlotIds: string[] = [];
    const changedJobIds = new Set<string>();

    for (const slot of futureSlots) {
      const job = jobsMap.get(slot.job_id);
      if (!job) continue;

      const jobDate = getJobDate(job);

      let replacementCleanerId: string | null = null;

      if (mode === "reoffer_to_backups") {
        const assignmentsForProperty = assignmentMap.get(job.property_id) || [];
        const previouslyDeclinedCleanerIds = await loadPreviouslyDeclinedCleanerIds(supabase, slot.job_id);
        const unavailableCleanerIds = unavailableCleanerIdsByJobId.get(slot.job_id) ?? new Set<string>();

        for (const a of assignmentsForProperty) {
          if (
            a.cleaner_account_id !== cleanerAccountId &&
            !previouslyDeclinedCleanerIds.has(a.cleaner_account_id) &&
            !unavailableCleanerIds.has(a.cleaner_account_id)
          ) {
            replacementCleanerId = a.cleaner_account_id;
            break;
          }
        }
      }

      if (replacementCleanerId) {
        const replacementCleanerName = cleanerNameById.get(replacementCleanerId) || null;
        const now = new Date();
        const offeredAt = now.toISOString();
        const expiresAt = getCleanerOfferExpiresAtForDailySweep(jobDate, now);

        const { data: updatedSlot, error: updateError } = await supabase
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: replacementCleanerId,
            status: "offered",
            offered_at: offeredAt,
            expires_at: expiresAt,
            accepted_at: null,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
            offer_email_sent_at: null,
            offer_reminder_sent_at: null,
            day_of_reminder_sent_at: null,
            offer_push_sent_at: null,
            offer_reminder_push_sent_at: null,
            day_of_reminder_push_sent_at: null,
          })
          .eq("id", slot.id)
          .eq("cleaner_account_id", cleanerAccountId)
          .eq("status", "accepted")
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedSlot) {
          skippedBecauseChanged += 1;
          continue;
        }

        await writeAuditLog(supabase, {
          actorProfileId: currentProfile.id,
          actorEmail: currentProfile.email || user.email || null,
          actorRole: currentProfile.role,
          organizationId: cleanerAccount.organization_id,
          actionType: "admin.reassign_cleaner_slot",
          targetType: "turnover_job_slot",
          targetId: slot.id,
          metadata: {
            reassign_source: "release_cleaner_future_jobs",
            job_id: slot.job_id,
            slot_number: slot.slot_number,
            previous_cleaner_account_id: cleanerAccount.id,
            previous_cleaner_name: cleanerAccount.display_name || null,
            previous_status: slot.status,
            previous_offered_at: slot.offered_at,
            previous_expires_at: slot.expires_at,
            previous_accepted_at: slot.accepted_at,
            previous_declined_at: slot.declined_at,
            new_cleaner_account_id: replacementCleanerId,
            new_cleaner_name: replacementCleanerName,
            new_offered_at: offeredAt,
            new_expires_at: expiresAt,
          },
        });

        reoffered++;
        reofferedSlotIds.push(slot.id);
        changedJobIds.add(slot.job_id);
      } else {
        const { data: updatedSlot, error: updateError } = await supabase
          .from("turnover_job_slots")
          .update({
            cleaner_account_id: null,
            status: "stranded",
            offered_at: null,
            expires_at: null,
            accepted_at: null,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
            offer_email_sent_at: null,
            offer_reminder_sent_at: null,
            day_of_reminder_sent_at: null,
            offer_push_sent_at: null,
            offer_reminder_push_sent_at: null,
            day_of_reminder_push_sent_at: null,
          })
          .eq("id", slot.id)
          .eq("cleaner_account_id", cleanerAccountId)
          .eq("status", "accepted")
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updatedSlot) {
          skippedBecauseChanged += 1;
          continue;
        }

        await writeAuditLog(supabase, {
          actorProfileId: currentProfile.id,
          actorEmail: currentProfile.email || user.email || null,
          actorRole: currentProfile.role,
          organizationId: cleanerAccount.organization_id,
          actionType: "admin.release_cleaner_future_job_stranded",
          targetType: "turnover_job_slot",
          targetId: slot.id,
          metadata: {
            job_id: slot.job_id,
            slot_number: slot.slot_number,
            previous_cleaner_account_id: cleanerAccount.id,
            previous_cleaner_name: cleanerAccount.display_name || null,
            previous_status: slot.status,
            previous_offered_at: slot.offered_at,
            previous_expires_at: slot.expires_at,
            previous_accepted_at: slot.accepted_at,
            release_source: "release_cleaner_future_jobs",
          },
        });

        stranded++;
        changedJobIds.add(slot.job_id);
      }
    }

    for (const changedJobId of changedJobIds) {
      await refreshJobStaffing(supabase, "cleaner", changedJobId);
    }

    let notificationResult: Awaited<ReturnType<typeof sendJobOfferEmailsForSlots>> | Awaited<ReturnType<typeof sendJobOfferDigestEmailForSlots>> | null = null;
    if (reofferedSlotIds.length > 0 && notifyMode !== "none") {
      notificationResult =
        notifyMode === "digest"
          ? await sendJobOfferDigestEmailForSlots(
              "cleaner",
              reofferedSlotIds,
              new URL(req.url).origin,
              { subjectPrefix: "Backup" }
            )
          : await sendJobOfferEmailsForSlots(
              "cleaner",
              reofferedSlotIds,
              new URL(req.url).origin
            );
    }

    return Response.json({
      ok: true,
      affected: reoffered + stranded,
      reoffered,
      stranded,
      skippedBecauseChanged,
      notifyMode,
      notificationResult,
      notificationErrors: notificationResult?.errors ?? [],
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
