import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPublicText } from "./safe-remote-fetch";
import { calendarDownloadIsFresh, parseCalendarSnapshot } from "../calendar-snapshot";
import { normalizePropertyCleanerOfferLeadDays } from "./cleaner-offer-hold";

export const safeCalendarSyncEnabled = () => process.env.CALENDAR_SYNC_SAFETY_ENABLED === "true";

export async function syncCalendarsSafely(service: SupabaseClient, organizationIds: string[] | null, propertyId?: string) {
  if (!safeCalendarSyncEnabled()) throw new Error("Calendar safety is disabled.");
  let q = service.from("properties").select("id,organization_id,cleaner_offer_lead_days").order("id");
  if (organizationIds) q = q.in("organization_id", organizationIds);
  if (propertyId) q = q.eq("id", propertyId);
  const properties = await q;
  if (properties.error) throw new Error("Property scope unavailable.");
  if (propertyId && !properties.data?.length) throw new Error("Property scope mismatch.");
  const map = new Map((properties.data || []).map(p => [p.id, p]));
  if (!map.size) return { ok: true, calendars_found: 0, totals: { created: 0, errors: 0 }, results: [] };
  const feeds = await service.from("property_calendars").select("id,property_id,source,ical_url").eq("is_active", true).in("property_id", [...map.keys()]).order("id");
  if (feeds.error) throw new Error("Calendar feeds unavailable.");
  // Refuse an unbounded all-feed sweep; a release capacity check must establish
  // that the selected feed set fits the 240s function budget.
  if ((feeds.data?.length || 0) > 8) throw new Error("Calendar batch exceeds reviewed capacity (8 feeds).");
  const prior = await service.from("calendar_sync_feeds").select("calendar_id,attempted_at").in("calendar_id", (feeds.data || []).map(f => f.id));
  if (prior.error) throw new Error("Calendar progress unavailable.");
  const attempted = new Map((prior.data || []).map(f => [f.calendar_id, f.attempted_at || ""]));
  (feeds.data || []).sort((a, b) => String(attempted.get(a.id) || "").localeCompare(String(attempted.get(b.id) || "")) || a.id.localeCompare(b.id));
  const started = Date.now();
  const results: { property_id: string; source: string; created: number; errors: string[]; skipped_busy?: boolean }[] = [];
  for (const feed of feeds.data || []) {
    const property = map.get(feed.property_id)!;
    const result = { property_id: feed.property_id, source: feed.source, created: 0, errors: [] as string[], skipped_busy: false };
    results.push(result);
    const lease = await service.rpc("acquire_calendar_sync", { p_org: property.organization_id, p_property: property.id });
    if (lease.error) { result.errors.push("calendar_lease_unavailable"); continue; }
    if (!lease.data) { result.skipped_busy = true; continue; }
    try {
      if (Date.now() - started > 180_000) throw new Error("Calendar budget exhausted.");
      const response = await fetchPublicText(feed.ical_url, { maxBytes: 5 * 1024 * 1024, timeoutMs: 15_000, accept: "text/calendar,text/plain", userAgent: "gulera-calendar-sync" });
      const events = parseCalendarSnapshot(response.text, normalizePropertyCleanerOfferLeadDays(property.cleaner_offer_lead_days)).map(e => ({ ...e, notes: `[AUTO_SYNC:${feed.source}:${e.uid}]\nCheckout date: ${e.checkout_date}` }));
      const hash = createHash("sha256").update(JSON.stringify(events)).digest("hex");
      const applied = await service.rpc("apply_calendar_snapshot_observed", { p_org: property.organization_id, p_property: property.id, p_calendar: feed.id, p_token: lease.data, p_hash: hash, p_events: events, p_fresh: calendarDownloadIsFresh(response) });
      if (applied.error) throw new Error("calendar_snapshot_rejected");
      result.created = Number(applied.data?.created) || 0;
    } catch {
      result.errors.push("calendar_download_or_apply_failed");
      // Sanitized reason only. Do not log the URL, feed body, or raw exception.
      const recorded = await service.rpc("fail_calendar_sync", { p_org: property.organization_id, p_property: property.id, p_calendar: feed.id, p_token: lease.data });
      if (recorded.error) result.errors.push("calendar_error_audit_failed");
    }
  }
  return { ok: results.every(r => !r.errors.length), calendars_found: feeds.data?.length || 0,
    totals: { created: results.reduce((n, r) => n + r.created, 0), errors: results.reduce((n, r) => n + r.errors.length, 0) }, results };
}
