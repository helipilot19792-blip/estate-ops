type TrackFeatureUsageInput = {
  organizationId?: string | null;
  portal: "admin" | "owner" | "cleaner" | "grounds" | "platform";
  area: string;
  featureKey: string;
  featureLabel: string;
  action?: string;
  metadata?: Record<string, unknown>;
};

const trackedRecently = new Map<string, number>();
const TRACK_WINDOW_MS = 5 * 60 * 1000;

export function trackFeatureUsage(input: TrackFeatureUsageInput) {
  if (typeof window === "undefined") return;
  if (!input.organizationId) return;

  const action = input.action || "open";
  const dedupeKey = [
    input.organizationId,
    input.portal,
    input.area,
    input.featureKey,
    action,
  ].join(":");
  const now = Date.now();
  const lastTrackedAt = trackedRecently.get(dedupeKey) || 0;

  if (now - lastTrackedAt < TRACK_WINDOW_MS) return;
  trackedRecently.set(dedupeKey, now);

  const payload = {
    organizationId: input.organizationId,
    portal: input.portal,
    area: input.area,
    featureKey: input.featureKey,
    featureLabel: input.featureLabel,
    action,
    path: `${window.location.pathname}${window.location.search}`,
    metadata: input.metadata || {},
  };

  void supabase.auth
    .getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;

      return fetch("/api/feature-usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    })
    .catch(() => {
      // Usage tracking should never interrupt the workflow being tracked.
    });
}
import { supabase } from "@/lib/supabase";
