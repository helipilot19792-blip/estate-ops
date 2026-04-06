import { createClient } from "@supabase/supabase-js";

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

function parseCheckoutDate(rawValue: string | null): string | null {
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
        const checkoutDate = parseCheckoutDate(dtendRaw);

        events.push({
          uid,
          summary,
          dtstartRaw,
          dtendRaw,
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

function buildJobNotes(params: {
  source: string;
  summary: string;
  checkoutDate: string;
  propertyName: string;
  marker: string;
}): string {
  return [
    `Auto-created from ${params.source.toUpperCase()} calendar sync.`,
    `Property: ${params.propertyName}`,
    `Guest / reservation: ${params.summary || "Reservation"}`,
    `Checkout date: ${params.checkoutDate}`,
    "",
    params.marker,
  ].join("\n");
}

function isFutureOrToday(dateString: string): boolean {
  const today = new Date();
  const todayYmd = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);

  return dateString >= todayYmd;
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
  const { data, error } = await supabase.from("properties").select("id, name, address");

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
    .select("id, property_id, notes")
    .eq("property_id", propertyId)
    .ilike("notes", `%${marker}%`)
    .limit(1);

  if (error) throw error;

  return ((data ?? []) as TurnoverJobRow[]).length > 0;
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

export async function POST() {
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
        errors: [] as string[],
      };

      try {
        const events = await getCalendarEvents(calendar);

        for (const event of events) {
          if (!event.checkoutDate) continue;

          if (!isRealBookingEvent(event.summary, calendar.source)) {
            resultBucket.skipped_non_booking += 1;
            continue;
          }

          if (!isFutureOrToday(event.checkoutDate)) {
            resultBucket.skipped_past += 1;
            continue;
          }

          const uid =
            event.uid ||
            `${calendar.property_id}:${calendar.source}:${event.dtstartRaw ?? "start"}:${event.dtendRaw ?? "end"}:${event.summary}`;

          const marker = buildSyncMarker(calendar.source, uid);
          const exists = await jobAlreadyExists(calendar.property_id, marker);

          if (exists) {
            resultBucket.skipped_existing += 1;
            continue;
          }

          const notes = buildJobNotes({
            source: calendar.source,
            summary: event.summary,
            checkoutDate: event.checkoutDate,
            propertyName,
            marker,
          });

          const { data: insertedJob, error: insertError } = await supabase
            .from("turnover_jobs")
            .insert({
              property_id: calendar.property_id,
              status: "pending",
              notes,
              scheduled_for: event.checkoutDate,
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

          resultBucket.created += 1;
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
        acc.errors += item.errors.length;
        return acc;
      },
      {
        created: 0,
        skipped_existing: 0,
        skipped_past: 0,
        skipped_non_booking: 0,
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