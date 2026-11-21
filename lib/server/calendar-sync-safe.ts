import { createHash, randomUUID } from "node:crypto";
import { observeCalendarBootstrap, type CalendarBootstrapReader } from "./calendar-bootstrap-diagnostics";
import { logCalendarFeedFailure, observeCalendarFeedCall, type CalendarFeedStage } from "./calendar-feed-diagnostics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicText } from "./safe-remote-fetch";
import { calendarDownloadIsFresh, parseCalendarSnapshot } from "../calendar-snapshot";
import { normalizePropertyCleanerOfferLeadDays } from "./cleaner-offer-hold";

export const safeCalendarSyncEnabled = () => process.env.CALENDAR_SYNC_SAFETY_ENABLED === "true";

export async function syncCalendarsSafely(service: SupabaseClient, organizationIds: string[] | null, propertyId?: string, bootstrap?: CalendarBootstrapReader) {
  if (!safeCalendarSyncEnabled()) throw new Error("Calendar safety is disabled.");
  const runId = randomUUID();
  const read: CalendarBootstrapReader = bootstrap ?? ((stage, query) => observeCalendarBootstrap(stage, query(undefined)));
  const properties = await read("properties", signal => {
    let q = service.from("properties").select("id,organization_id,cleaner_offer_lead_days").order("id");
    if (organizationIds) q = q.in("organization_id", organizationIds);
    if (propertyId) q = q.eq("id", propertyId);
    return signal ? q.abortSignal(signal) : q;
  });
  if (propertyId && !properties.data?.length) throw new Error("Property scope mismatch.");
  const map = new Map((properties.data || []).map(p => [p.id, p]));
  if (!map.size) return { ok: true, calendars_found: 0, totals: { created: 0, errors: 0 }, results: [] };
  const feeds = await read("active_feeds", signal => {
    const q = service.from("property_calendars").select("id,property_id,source,ical_url")
      .eq("is_active", true).in("property_id", [...map.keys()]).order("id");
    return signal ? q.abortSignal(signal) : q;
  });
  // Refuse an unbounded all-feed sweep; a release capacity check must establish
  // that the selected feed set fits the 240s function budget.
  if ((feeds.data?.length || 0) > 8) throw new Error("Calendar batch exceeds reviewed capacity (8 feeds).");
  const prior = await read("progress", signal => {
    const q = service.from("calendar_sync_feeds").select("calendar_id,attempted_at")
      .in("calendar_id", (feeds.data || []).map(f => f.id));
    return signal ? q.abortSignal(signal) : q;
  });
  const attempted = new Map((prior.data || []).map(f => [f.calendar_id, f.attempted_at || ""]));
  (feeds.data || []).sort((a, b) => String(attempted.get(a.id) || "").localeCompare(String(attempted.get(b.id) || "")) || a.id.localeCompare(b.id));
  const started = Date.now();
  const results: { property_id: string; source: string; created: number; errors: string[]; skipped_busy?: boolean; feed_retrieved?: boolean; feed_validated?: boolean; date_changes_reconciled?: number; checkin_changes_reconciled?: number; changes_requiring_review?: number; reconciliation_reported?: boolean; unknown_events?: number; blocked_events?: number }[] = [];
  for (const feed of feeds.data || []) {
    const property = map.get(feed.property_id)!;
    const result: (typeof results)[number] = { property_id: feed.property_id, source: feed.source, created: 0, errors: [] as string[], skipped_busy: false };
    results.push(result);
    const leaseContext = { runId, calendarId: feed.id, stage: "lease" as const, startedAt: Date.now() };
    const lease = await observeCalendarFeedCall(leaseContext, () => service.rpc("acquire_calendar_sync", { p_org: property.organization_id, p_property: property.id }));
    if (lease.error) { logCalendarFeedFailure(leaseContext, lease.error, lease.status); result.errors.push("calendar_lease_unavailable"); continue; }
    if (!lease.data) { result.skipped_busy = true; continue; }
    let stage: CalendarFeedStage = "budget", stageStarted = Date.now(), applyFailureLogged = false;
    try {
      if (Date.now() - started > 180_000) throw new Error("Calendar budget exhausted.");
      stage = "download"; stageStarted = Date.now();
      const response = await fetchPublicText(feed.ical_url, { maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000, accept: "text/calendar,text/plain", userAgent: "gulera-calendar-sync" });
      result.feed_retrieved = true;
      stage = "parse"; stageStarted = Date.now();
      const classification = { blocked: 0, unknown: 0 };
      const events = parseCalendarSnapshot(response.text, normalizePropertyCleanerOfferLeadDays(property.cleaner_offer_lead_days), { source: feed.source, classification }).map(e => ({ ...e, notes: `[AUTO_SYNC:${feed.source}:${e.uid}]\nCheckout date: ${e.checkout_date}` }));
      result.feed_validated = true; result.blocked_events = classification.blocked; result.unknown_events = classification.unknown;
      const hash = createHash("sha256").update(JSON.stringify(events)).digest("hex");
      stage = "apply"; stageStarted = Date.now();
      const applied = await service.rpc("apply_calendar_snapshot_observed", { p_org: property.organization_id, p_property: property.id, p_calendar: feed.id, p_token: lease.data, p_hash: hash, p_events: events, p_fresh: classification.unknown === 0 && calendarDownloadIsFresh(response) });
      if (applied.error) {
        logCalendarFeedFailure({ runId, calendarId: feed.id, stage, startedAt: stageStarted }, applied.error, applied.status);
        applyFailureLogged = true;
        throw new Error("calendar_snapshot_rejected");
      }
      result.created = Number(applied.data?.created) || 0;
      result.reconciliation_reported = typeof applied.data?.changes_requiring_review === "number";
      result.date_changes_reconciled = Number(applied.data?.date_changes_reconciled) || 0;
      result.checkin_changes_reconciled = Number(applied.data?.checkin_changes_reconciled) || 0;
      result.changes_requiring_review = Number(applied.data?.changes_requiring_review) || 0;
    } catch (error) {
      if (!applyFailureLogged) logCalendarFeedFailure({ runId, calendarId: feed.id, stage, startedAt: stageStarted }, error);
      result.errors.push("calendar_download_or_apply_failed");
      // Sanitized reason only. Do not log the URL, feed body, or raw exception.
      const auditContext = { runId, calendarId: feed.id, stage: "failure_audit" as const, startedAt: Date.now() };
      const recorded = await observeCalendarFeedCall(auditContext, () => service.rpc("fail_calendar_sync", { p_org: property.organization_id, p_property: property.id, p_calendar: feed.id, p_token: lease.data }));
      if (recorded.error) { logCalendarFeedFailure(auditContext, recorded.error, recorded.status); result.errors.push("calendar_error_audit_failed"); }
    }
  }
  return { ok: results.every(r => !r.errors.length), calendars_found: feeds.data?.length || 0,
    totals: { feeds_retrieved: results.filter(r=>r.feed_retrieved).length, feeds_validated: results.filter(r=>r.feed_validated).length, skipped_busy: results.filter(r=>r.skipped_busy).length, reconciliation_reported: results.filter(r=>r.feed_validated && !r.errors.length).every(r=>r.reconciliation_reported), date_changes_reconciled: results.reduce((n,r)=>n+(r.date_changes_reconciled||0),0), checkin_changes_reconciled: results.reduce((n,r)=>n+(r.checkin_changes_reconciled||0),0), changes_requiring_review: results.reduce((n,r)=>n+(r.changes_requiring_review||0),0), unknown_events: results.reduce((n,r)=>n+(r.unknown_events||0),0), blocked_events: results.reduce((n,r)=>n+(r.blocked_events||0),0), created: results.reduce((n, r) => n + r.created, 0), errors: results.reduce((n, r) => n + r.errors.length, 0) }, results };
}
