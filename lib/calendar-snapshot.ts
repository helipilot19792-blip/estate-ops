import { classifyCalendarEntry } from "./calendar-reservation-evidence";
export type CalendarEvent = { uid: string; summary: string; checkin_date: string; checkout_date: string; notes: string; lead_days: number; eligible_at: string | null };

// Transport freshness permits counting an observation, never a one-download cancellation.
// Missing headers do not stop ordinary imports; they disable absence reconciliation.
export function calendarDownloadIsFresh(response: { status: number; contentType: string; responseDate?: string | null; responseAge?: string | null }, now = Date.now()) {
  const date = Date.parse(response.responseDate || "");
  const age = response.responseAge == null ? 0 : /^\d+$/.test(response.responseAge) ? Number(response.responseAge) : NaN;
  return response.status === 200 && /^(text\/calendar|text\/plain)(?:;|$)/i.test(response.contentType)
    && Number.isFinite(date) && date >= now - 300_000 && date <= now + 60_000
    && Number.isFinite(age) && age <= 60;
}

// Deliberately fail the entire snapshot on malformed/unsupported reservation data.
// A successful HTTP download is not proof of a complete or current calendar.
export function parseCalendarSnapshot(text: string, leadDays = 90, options: { source?: string; classification?: { blocked: number; unknown: number } } = {}): CalendarEvent[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").trim().split("\n");
  if (lines[0] !== "BEGIN:VCALENDAR" || lines.at(-1) !== "END:VCALENDAR") throw new Error("invalid_calendar_envelope");
  const events: CalendarEvent[] = [], seen = new Set<string>();
  let current: Record<string, string> | null = null;
  const date = (raw: string) => {
    if (!/^\d{8}(T\d{6}Z?)?$/.test(raw || "")) throw new Error("invalid_calendar_date");
    const d = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) !== d) throw new Error("invalid_calendar_date");
    return d;
  };
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { if (current) throw new Error("nested_calendar_event"); current = {}; continue; }
    if (line === "END:VEVENT") {
      if (!current) throw new Error("unmatched_calendar_event");
      const e = current; current = null;
      if (!e.UID || seen.has(e.UID) || e.UID.length > 1024) throw new Error("missing_or_duplicate_uid");
      seen.add(e.UID);
      // Canceled/recurring entries are retained as review by absence. Never guess
      // recurrence expansion or manufacture a date for a cancellation tombstone.
      if (e.RRULE || e.RECURRENCE_ID) throw new Error("recurring_calendar_requires_review");
      if (e.STATUS === "CANCELLED") continue;
      const checkin = date(e.DTSTART), checkout = date(e.DTEND);
      if (checkout <= checkin) throw new Error("invalid_calendar_interval");
      const summary = (e.SUMMARY || "Reservation").replace(/\\[nN]/g, " ").replace(/\\([,;\\])/g, "$1").slice(0, 500);
      const kind = classifyCalendarEntry(e, options.source);
      if (kind !== "reservation") {
        if (options.classification) options.classification[kind] += 1;
        continue;
      }
      const eligible = new Date(`${checkout}T12:00:00Z`); eligible.setUTCDate(eligible.getUTCDate() - leadDays);
      events.push({ uid: e.UID, summary, checkin_date: checkin, checkout_date: checkout, lead_days: leadDays,
        eligible_at: leadDays > 0 ? eligible.toISOString().slice(0, 10) : null, notes: `[AUTO_SYNC:${e.SOURCE || "calendar"}:${e.UID}]\nCheckout date: ${checkout}` });
      if (events.length > 2000) throw new Error("calendar_event_limit");
      continue;
    }
    if (current) {
      const colon = line.indexOf(":"); if (colon < 1) throw new Error("malformed_calendar_line");
      const key = line.slice(0, colon).split(";")[0].replaceAll("-", "_").toUpperCase();
      if (["UID", "DTSTART", "DTEND", "STATUS", "RRULE", "RECURRENCE_ID"].includes(key) && key in current) throw new Error("duplicate_calendar_field");
      current[key] = line.slice(colon + 1).trim();
    }
  }
  if (current) throw new Error("incomplete_calendar_event");
  return events;
}
