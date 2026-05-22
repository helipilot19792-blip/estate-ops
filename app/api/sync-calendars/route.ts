import { createClient } from "@supabase/supabase-js";
import {
  sendJobCancellationNotificationsForJobs,
  sendJobOfferEmailsForSlots,
} from "@/lib/server/job-notifications";

export const dynamic = "force-dynamic";

type PropertyCalendarRow = {
  id: string;
  property_id: string;
  source: string;
  ical_url: string;
  is_active: boolean | null;
};

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string | null;
  address: string | null;
};

type TurnoverJobRow = {
  id: string;
  property_id: string;
  notes: string | null;
  scheduled_for: string | null;
  status: string | null;
};

type ParsedEvent = {
  uid: string;
  summary: string;
  description: string;
  guestCount: number | null;
  dtstartRaw: string | null;
  dtendRaw: string | null;
  checkinDate: string | null;
  checkoutDate: string | null;
};

type SyncAuthContext = {
  mode: "cron" | "user";
  organizationIds: string[] | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireSyncAccess(request: Request, organizationId?: string | null): Promise<SyncAuthContext> {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && authHeader === `Bearer ${expected}`) {
    return {
      mode: "cron",
      organizationIds: organizationId ? [organizationId] : null,
    };
  }

  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    throw new Error("Missing access token.");
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing public Supabase key.");
  }

  const authClient = createClient(supabaseUrl!, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    (profile.role !== "admin" && profile.role !== "platform_admin")
  ) {
    throw new Error("Admin access required.");
  }

  if (!organizationId) {
    throw new Error("organizationId is required.");
  }

  if (profile.role === "platform_admin") {
    return {
      mode: "user",
      organizationIds: [organizationId],
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .limit(1);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (!(memberships ?? []).length) {
    throw new Error("You do not have admin access to this organization.");
  }

  return {
    mode: "user",
    organizationIds: [organizationId],
  };
}

function unfoldIcsLines(icsText: string): string[] {
  const rawLines = icsText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];

  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

function getIcsValue(line: string): string {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return "";
  return line.slice(colonIndex + 1).trim();
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(rawValue: string | null): string | null {
  if (!rawValue) return null;

  const dateOnlyMatch = rawValue.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
  }

  const dateTimeMatch = rawValue.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (dateTimeMatch) {
    return `${dateTimeMatch[1]}-${dateTimeMatch[2]}-${dateTimeMatch[3]}`;
  }

  return null;
}

function parseGuestCountFromText(...values: Array<string | null | undefined>): number | null {
  const text = values.filter(Boolean).join("\n");
  if (!text.trim()) return null;

  const adultCount = text.match(/\badults?\s*[:=-]?\s*(\d{1,2})\b/i) ?? text.match(/\b(\d{1,2})\s*adults?\b/i);
  const childCount =
    text.match(/\b(?:children|child|kids?)\s*[:=-]?\s*(\d{1,2})\b/i) ??
    text.match(/\b(\d{1,2})\s*(?:children|child|kids?)\b/i);
  const infantCount =
    text.match(/\binfants?\s*[:=-]?\s*(\d{1,2})\b/i) ??
    text.match(/\b(\d{1,2})\s*infants?\b/i);
  const groupedCount =
    Number(adultCount?.[1] || 0) + Number(childCount?.[1] || 0) + Number(infantCount?.[1] || 0);

  if (groupedCount > 0 && groupedCount < 100) {
    return groupedCount;
  }

  const patterns = [
    /\b(?:guests?|guest count|number of guests|party size|occupants?|people)\s*[:=-]?\s*(\d{1,2})\b/i,
    /\b(\d{1,2})\s*(?:guests?|people|occupants?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const count = Number(match[1]);
    if (Number.isFinite(count) && count > 0 && count < 100) return count;
  }

  return null;
}

function parseIcsEvents(icsText: string): ParsedEvent[] {
  const lines = unfoldIcsLines(icsText);
  const events: ParsedEvent[] = [];
  let inEvent = false;
  let current: Record<string, string[]> = {};

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (inEvent) {
        const uid = current.UID?.[0] ?? "";
        const summary = unescapeIcsText(current.SUMMARY?.[0] ?? "Reservation");
        const description = unescapeIcsText(current.DESCRIPTION?.join("\n") ?? "");
        const guestCount = parseGuestCountFromText(summary, description);
        const dtstartRaw = current.DTSTART?.[0] ?? null;
        const dtendRaw = current.DTEND?.[0] ?? null;
        const checkinDate = parseIcsDate(dtstartRaw);
const checkoutDate = parseIcsDate(dtendRaw);

      events.push({
  uid,
  summary,
  description,
  guestCount,
  dtstartRaw,
  dtendRaw,
  checkinDate,
  checkoutDate,
});
      }

      inEvent = false;
      current = {};
      continue;
    }

    if (!inEvent) continue;

    const namePart = line.split(":")[0] ?? "";
    const key = namePart.split(";")[0]?.toUpperCase().trim();

    if (!key) continue;

    if (!current[key]) {
      current[key] = [];
    }

    current[key].push(getIcsValue(line));
  }

  return events.filter((event) => Boolean(event.checkoutDate));
}

function buildSyncMarker(source: string, uid: string): string {
  return `[AUTO_SYNC:${source}:${uid}]`;
}

function getSyncMarkerPrefix(source: string): string {
  return `[AUTO_SYNC:${source}:`;
}

function getSyncMarkerUid(notes: string | null, source: string): string | null {
  if (!notes) return null;

  const prefix = getSyncMarkerPrefix(source);
  const start = notes.indexOf(prefix);
  if (start < 0) return null;

  const uidStart = start + prefix.length;
  const end = notes.indexOf("]", uidStart);
  if (end < 0) return null;

  return notes.slice(uidStart, end);
}

function getCheckoutDateFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function buildAutoSyncNotes(
  calendar: PropertyCalendarRow,
  propertyName: string,
  event: ParsedEvent,
  marker: string
) {
  return [
    `Auto-created from ${calendar.source.toUpperCase()} calendar sync.`,
    `Property: ${propertyName}`,
    `Guest / reservation: ${event.summary || "Reservation"}`,
    event.guestCount ? `Guest count: ${event.guestCount}` : "Guest count: Not provided by calendar feed",
    `Check-in date: ${event.checkinDate || "Unknown"}`,
    `Checkout date: ${event.checkoutDate}`,
    "",
    marker,
  ].join("\n");
}

function getTodayYmd() {
  const today = new Date();
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

function isFutureOrToday(dateString: string): boolean {
  return dateString >= getTodayYmd();
}

function isRealBookingEvent(summary: string, source: string): boolean {
  const s = (summary || "").toLowerCase().trim();

  if (source === "airbnb") {
    if (s.includes("not available")) return false;
    if (s.includes("blocked")) return false;
    if (s.includes("maintenance")) return false;
    if (s.includes("unavailable")) return false;
    if (s.includes("reserved")) return true;
    return true;
  }

  if (source === "vrbo") {
    if (s.includes("not available")) return false;
    if (s.includes("blocked")) return false;
    if (s.includes("maintenance")) return false;
    if (s.includes("unavailable")) return false;
    return true;
  }

  return true;
}

async function loadCalendars(propertyIds?: string[]) {
  if (propertyIds && propertyIds.length === 0) {
    return [] as PropertyCalendarRow[];
  }

  let query = supabase
    .from("property_calendars")
    .select("id, property_id, source, ical_url, is_active")
    .eq("is_active", true);

  if (propertyIds?.length === 1) {
    query = query.eq("property_id", propertyIds[0]);
  } else if (propertyIds && propertyIds.length > 1) {
    query = query.in("property_id", propertyIds);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as PropertyCalendarRow[];
}

async function loadPropertiesMap(organizationIds?: string[] | null) {
  let query = supabase
    .from("properties")
    .select("id, organization_id, name, address");

  if (organizationIds?.length === 1) {
    query = query.eq("organization_id", organizationIds[0]);
  } else if (organizationIds && organizationIds.length > 1) {
    query = query.in("organization_id", organizationIds);
  }

  const { data, error } = await query;

  if (error) throw error;

  const map = new Map<string, PropertyRow>();
  for (const row of (data ?? []) as PropertyRow[]) {
    map.set(row.id, row);
  }
  return map;
}

async function findSyncedJob(propertyId: string, marker: string): Promise<TurnoverJobRow | null> {
  const { data, error } = await supabase
    .from("turnover_jobs")
    .select("id, property_id, notes, scheduled_for, status")
    .eq("property_id", propertyId)
    .limit(200);

  if (error) throw error;

  return (
    ((data ?? []) as TurnoverJobRow[]).find((row) => (row.notes || "").includes(marker)) ??
    null
  );
}

async function updateSyncedJobIfChanged(
  job: TurnoverJobRow,
  event: ParsedEvent,
  notes: string
) {
  if (job.scheduled_for === event.checkoutDate && (job.notes || "") === notes) {
    return false;
  }

  const { error } = await supabase
    .from("turnover_jobs")
    .update({
      scheduled_for: event.checkoutDate,
      notes,
    })
    .eq("id", job.id);

  if (error) throw error;
  return true;
}

async function deleteStaleUpcomingSyncedJobs(
  propertyId: string,
  source: string,
  seenExternalUids: Set<string>,
  origin: string
) {
  const todayYmd = getTodayYmd();
  const { data, error } = await supabase
    .from("turnover_jobs")
    .select("id, property_id, notes, scheduled_for, status")
    .eq("property_id", propertyId)
    .limit(500);

  if (error) throw error;

  const staleJobIds = ((data ?? []) as TurnoverJobRow[])
    .filter((job) => {
      const uid = getSyncMarkerUid(job.notes, source);
      if (!uid || seenExternalUids.has(uid)) return false;

      const jobDate = job.scheduled_for || getCheckoutDateFromNotes(job.notes) || "";
      return jobDate >= todayYmd;
    })
    .map((job) => job.id);

  if (staleJobIds.length === 0) {
    return {
      removed: 0,
      notificationSent: 0,
      pushSent: 0,
      notificationErrors: [] as string[],
    };
  }

  const notificationResult = await sendJobCancellationNotificationsForJobs(
    "cleaner",
    staleJobIds,
    origin
  );

  const { error: slotDeleteError } = await supabase
    .from("turnover_job_slots")
    .delete()
    .in("job_id", staleJobIds);

  if (slotDeleteError) throw slotDeleteError;

  const { error: jobDeleteError } = await supabase
    .from("turnover_jobs")
    .delete()
    .in("id", staleJobIds);

  if (jobDeleteError) throw jobDeleteError;

  return {
    removed: staleJobIds.length,
    notificationSent: notificationResult.sent,
    pushSent: notificationResult.pushSent,
    notificationErrors: notificationResult.errors,
  };
}

async function getCalendarEvents(calendar: PropertyCalendarRow): Promise<ParsedEvent[]> {
  const response = await fetch(calendar.ical_url, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "estate-ops-calendar-sync",
      Accept: "text/calendar,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Calendar fetch failed with status ${response.status}`);
  }

  const icsText = await response.text();
  return parseIcsEvents(icsText);
}

async function upsertBookingEvent(
  calendar: PropertyCalendarRow,
  property: PropertyRow,
  event: ParsedEvent,
  externalUid: string
) {
  if (!event.checkinDate || !event.checkoutDate) return;

  const payload = {
    organization_id: property.organization_id,
    property_id: calendar.property_id,
    property_calendar_id: calendar.id,
    source: calendar.source,
    external_uid: externalUid,
    summary: event.summary || "Reservation",
    guest_count: event.guestCount,
    checkin_date: event.checkinDate,
    checkout_date: event.checkoutDate,
    raw_dtstart: event.dtstartRaw,
    raw_dtend: event.dtendRaw,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("property_booking_events")
    .upsert(payload, {
      onConflict: "property_id,source,external_uid",
    });

  if (!error) return;

  const message = error.message || "";
  if (message.includes("guest_count") || error.code === "PGRST204" || error.code === "PGRST205") {
    const fallbackPayload = { ...payload };
    delete (fallbackPayload as Partial<typeof payload>).guest_count;
    const { error: fallbackError } = await supabase
      .from("property_booking_events")
      .upsert(fallbackPayload, {
        onConflict: "property_id,source,external_uid",
      });

    if (fallbackError) throw fallbackError;
    return;
  }

  throw error;
}

async function deleteStaleUpcomingBookingEvents(
  calendarId: string,
  seenExternalUids: Set<string>
) {
  const { data, error } = await supabase
    .from("property_booking_events")
    .select("id, external_uid")
    .eq("property_calendar_id", calendarId)
    .gte("checkout_date", getTodayYmd());

  if (error) throw error;

  const staleIds = ((data ?? []) as Array<{ id: string; external_uid: string }>)
    .filter((row) => !seenExternalUids.has(row.external_uid))
    .map((row) => row.id);

  if (staleIds.length === 0) return 0;

  const { error: deleteError } = await supabase
    .from("property_booking_events")
    .delete()
    .in("id", staleIds);

  if (deleteError) throw deleteError;

  return staleIds.length;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || "";
    const auth = await requireSyncAccess(request, organizationId || null);
    const propertiesMap = await loadPropertiesMap(auth.organizationIds);
    const calendars = await loadCalendars([...propertiesMap.keys()]);

    const preview: Array<{
      property_id: string;
      property_name: string;
      source: string;
      event_count: number;
      upcoming_checkouts: ParsedEvent[];
    }> = [];

    for (const calendar of calendars) {
      const property = propertiesMap.get(calendar.property_id);
      const events = await getCalendarEvents(calendar);
      const upcoming = events.filter(
        (event) =>
          event.checkoutDate &&
          isFutureOrToday(event.checkoutDate) &&
          isRealBookingEvent(event.summary, calendar.source)
      );

      preview.push({
        property_id: calendar.property_id,
        property_name: property?.name || "Unknown property",
        source: calendar.source,
        event_count: upcoming.length,
        upcoming_checkouts: upcoming.slice(0, 20),
      });
    }

    return Response.json({
      ok: true,
      mode: "preview",
      calendars_found: calendars.length,
      preview,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      {
        status:
          error?.message === "Missing access token." || error?.message === "Not authenticated."
            ? 401
            : error?.message === "Admin access required." ||
                error?.message === "organizationId is required." ||
                error?.message === "You do not have admin access to this organization." ||
                error?.message === "You do not have access to sync this property."
              ? 403
              : 500,
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    const propertyId =
      typeof body?.propertyId === "string" ? body.propertyId.trim() : "";
    const auth = await requireSyncAccess(request, organizationId || null);
    const propertiesMap = await loadPropertiesMap(auth.organizationIds);

    if (propertyId && !propertiesMap.has(propertyId)) {
      throw new Error("You do not have access to sync this property.");
    }

    const calendars = await loadCalendars(propertyId ? [propertyId] : [...propertiesMap.keys()]);

    const results: Array<{
      property_id: string;
      property_name: string;
      source: string;
      created: number;
      skipped_existing: number;
      skipped_past: number;
      skipped_non_booking: number;
      booking_events_saved: number;
      removed_missing_future: number;
      removed_missing_future_jobs: number;
      cancellation_notifications_sent: number;
      cancellation_push_notifications_sent: number;
      updated_jobs: number;
      created_dates: string[];
      existing_dates: string[];
      updated_dates: string[];
      errors: string[];
    }> = [];

    for (const calendar of calendars) {
      const property = propertiesMap.get(calendar.property_id);
      const propertyName = property?.name || "Unknown property";

      const resultBucket = {
        property_id: calendar.property_id,
        property_name: propertyName,
        source: calendar.source,
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        skipped_non_booking: 0,
        booking_events_saved: 0,
        removed_missing_future: 0,
        removed_missing_future_jobs: 0,
        cancellation_notifications_sent: 0,
        cancellation_push_notifications_sent: 0,
        updated_jobs: 0,
        created_dates: [] as string[],
        existing_dates: [] as string[],
        updated_dates: [] as string[],
        errors: [] as string[],
      };

      try {
        const events = await getCalendarEvents(calendar);
        const seenExternalUids = new Set<string>();

        for (const event of events) {
          if (!event.checkoutDate) continue;

          if (!isRealBookingEvent(event.summary, calendar.source)) {
            resultBucket.skipped_non_booking += 1;
            continue;
          }

          const uid =
            event.uid ||
            `${calendar.property_id}:${calendar.source}:${event.dtstartRaw ?? "start"}:${event.dtendRaw ?? "end"}:${event.summary}`;
          seenExternalUids.add(uid);

          if (property?.organization_id && event.checkinDate) {
            try {
              await upsertBookingEvent(calendar, property, event, uid);
              resultBucket.booking_events_saved += 1;
            } catch (bookingEventError: any) {
              resultBucket.errors.push(
                `Booking history save failed for ${event.summary || "reservation"} on ${event.checkoutDate}: ${bookingEventError?.message || "Unknown booking history error"}`
              );
            }
          }

          if (!isFutureOrToday(event.checkoutDate)) {
            resultBucket.skipped_past += 1;
            continue;
          }

          const marker = buildSyncMarker(calendar.source, uid);
          const notes = buildAutoSyncNotes(calendar, propertyName, event, marker);
          const existingJob = await findSyncedJob(calendar.property_id, marker);

          if (existingJob) {
            try {
              const updated = await updateSyncedJobIfChanged(existingJob, event, notes);
              if (updated) {
                resultBucket.updated_jobs += 1;
                resultBucket.updated_dates.push(event.checkoutDate);
              }
            } catch (updateError: any) {
              resultBucket.errors.push(
                `Failed to update job for ${event.summary || "reservation"} on ${event.checkoutDate}: ${updateError?.message || "Unknown update error"}`
              );
            }
            resultBucket.skipped_existing += 1;
            resultBucket.existing_dates.push(event.checkoutDate);
            continue;
          }

          if (!property?.organization_id) {
            resultBucket.errors.push(`Missing organization_id for property ${propertyName}`);
            continue;
          }

          const { data: insertedJob, error: insertError } = await supabase
            .from("turnover_jobs")
            .insert({
              organization_id: property?.organization_id,
              property_id: calendar.property_id,
              status: "pending",
              notes,
              scheduled_for: event.checkoutDate,
              cleaners_needed: 1,
              cleaners_required_strict: false,
              cleaner_units_needed: 1,
              cleaner_units_required_strict: false,
              show_team_status_to_cleaners: true,
            })
            .select("id")
            .single();

          if (insertError || !insertedJob) {
            resultBucket.errors.push(
              `Failed to create job for ${event.summary || "reservation"} on ${event.checkoutDate}: ${insertError?.message || "Unknown insert error"}`
            );
            continue;
          }

          const { error: slotError } = await supabase.rpc("create_slots_for_job", {
            p_job_id: insertedJob.id,
          });

          if (slotError) {
            resultBucket.errors.push(
              `Job created but slot creation failed for ${event.summary || "reservation"} on ${event.checkoutDate}: ${slotError.message}`
            );
            continue;
          }

          const { data: offerSlots, error: offerSlotsError } = await supabase
            .from("turnover_job_slots")
            .select("id")
            .eq("job_id", insertedJob.id)
            .eq("status", "offered")
            .not("cleaner_account_id", "is", null);

          if (!offerSlotsError && (offerSlots ?? []).length > 0) {
            const notificationResult = await sendJobOfferEmailsForSlots(
              "cleaner",
              (offerSlots ?? []).map((slot) => slot.id),
              new URL(request.url).origin
            );

            if (notificationResult.errors.length > 0) {
              resultBucket.errors.push(
                `Job offer email notification issue for ${event.summary || "reservation"} on ${event.checkoutDate}: ${notificationResult.errors.join("; ")}`
              );
            }
          }

          resultBucket.created += 1;
          resultBucket.created_dates.push(event.checkoutDate);
        }

        resultBucket.removed_missing_future = await deleteStaleUpcomingBookingEvents(
          calendar.id,
          seenExternalUids
        );
        const staleJobCleanup = await deleteStaleUpcomingSyncedJobs(
          calendar.property_id,
          calendar.source,
          seenExternalUids,
          new URL(request.url).origin
        );
        resultBucket.removed_missing_future_jobs = staleJobCleanup.removed;
        resultBucket.cancellation_notifications_sent = staleJobCleanup.notificationSent;
        resultBucket.cancellation_push_notifications_sent = staleJobCleanup.pushSent;
        if (staleJobCleanup.notificationErrors.length > 0) {
          resultBucket.errors.push(
            `Cancellation notification issue: ${staleJobCleanup.notificationErrors.join("; ")}`
          );
        }
      } catch (calendarError: any) {
        resultBucket.errors.push(calendarError?.message || "Calendar processing failed");
      }

      results.push(resultBucket);
    }

    const totals = results.reduce(
      (acc, item) => {
        acc.created += item.created;
        acc.skipped_existing += item.skipped_existing;
        acc.skipped_past += item.skipped_past;
        acc.skipped_non_booking += item.skipped_non_booking;
        acc.booking_events_saved += item.booking_events_saved;
        acc.removed_missing_future += item.removed_missing_future;
        acc.removed_missing_future_jobs += item.removed_missing_future_jobs;
        acc.cancellation_notifications_sent += item.cancellation_notifications_sent;
        acc.cancellation_push_notifications_sent += item.cancellation_push_notifications_sent;
        acc.updated_jobs += item.updated_jobs;
        acc.errors += item.errors.length;
        return acc;
      },
      {
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        skipped_non_booking: 0,
        booking_events_saved: 0,
        removed_missing_future: 0,
        removed_missing_future_jobs: 0,
        cancellation_notifications_sent: 0,
        cancellation_push_notifications_sent: 0,
        updated_jobs: 0,
        errors: 0,
      }
    );

    return Response.json({
      ok: true,
      mode: "sync",
      calendars_found: calendars.length,
      totals,
      results,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      {
        status:
          error?.message === "Missing access token." || error?.message === "Not authenticated."
            ? 401
            : error?.message === "Admin access required." ||
                error?.message === "organizationId is required." ||
                error?.message === "You do not have admin access to this organization."
              ? 403
              : 500,
      }
    );
  }
}
