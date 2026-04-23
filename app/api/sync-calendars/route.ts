import { createClient } from "@supabase/supabase-js";
import { sendJobOfferEmailsForSlots } from "@/lib/server/job-notifications";

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
};

type ParsedEvent = {
  uid: string;
  summary: string;
  dtstartRaw: string | null;
  dtendRaw: string | null;
  checkinDate: string | null;
  checkoutDate: string | null;
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
        const dtstartRaw = current.DTSTART?.[0] ?? null;
        const dtendRaw = current.DTEND?.[0] ?? null;
        const checkinDate = parseIcsDate(dtstartRaw);
const checkoutDate = parseIcsDate(dtendRaw);

      events.push({
  uid,
  summary,
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

async function loadCalendars() {
  const { data, error } = await supabase
    .from("property_calendars")
    .select("id, property_id, source, ical_url, is_active")
    .eq("is_active", true);

  if (error) throw error;
  return (data ?? []) as PropertyCalendarRow[];
}

async function loadPropertiesMap() {
 const { data, error } = await supabase
  .from("properties")
  .select("id, organization_id, name, address");

  if (error) throw error;

  const map = new Map<string, PropertyRow>();
  for (const row of (data ?? []) as PropertyRow[]) {
    map.set(row.id, row);
  }
  return map;
}

async function jobAlreadyExists(propertyId: string, marker: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("turnover_jobs")
    .select("id, notes")
    .eq("property_id", propertyId)
    .limit(200);

  if (error) throw error;

  return ((data ?? []) as Array<{ id: string; notes: string | null }>).some(
    (row) => (row.notes || "").includes(marker)
  );
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

  const { error } = await supabase
    .from("property_booking_events")
    .upsert(
      {
        organization_id: property.organization_id,
        property_id: calendar.property_id,
        property_calendar_id: calendar.id,
        source: calendar.source,
        external_uid: externalUid,
        summary: event.summary || "Reservation",
        checkin_date: event.checkinDate,
        checkout_date: event.checkoutDate,
        raw_dtstart: event.dtstartRaw,
        raw_dtend: event.dtendRaw,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "property_id,source,external_uid",
      }
    );

  if (error) throw error;
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

export async function GET() {
  try {
    const calendars = await loadCalendars();
    const propertiesMap = await loadPropertiesMap();

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
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const calendars = await loadCalendars();
    const propertiesMap = await loadPropertiesMap();

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
      created_dates: string[];
      existing_dates: string[];
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
        created_dates: [] as string[],
        existing_dates: [] as string[],
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
          const exists = await jobAlreadyExists(calendar.property_id, marker);

          if (exists) {
            resultBucket.skipped_existing += 1;
            resultBucket.existing_dates.push(event.checkoutDate);
            continue;
          }

       const notes = [
  `Auto-created from ${calendar.source.toUpperCase()} calendar sync.`,
  `Property: ${propertyName}`,
  `Guest / reservation: ${event.summary || "Reservation"}`,
  `Check-in date: ${event.checkinDate || "Unknown"}`,
  `Checkout date: ${event.checkoutDate}`,
  "",
  marker,
].join("\n");
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
      { status: 500 }
    );
  }
}
