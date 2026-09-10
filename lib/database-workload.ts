// Compare only persisted business fields, excluding sync bookkeeping timestamps.
export function bookingContentMatches(existing: Record<string, unknown> | null, incoming: Record<string, unknown>) {
  return Boolean(existing) && Object.entries(incoming).every(([key, value]) =>
    key === "last_seen_at" || key === "updated_at" || existing![key] === value
  );
}

export const DEVICE_HEARTBEAT_INTERVAL_MS = 5 * 60_000;

export function needsDeviceHeartbeat(lastSeen: string | null, now: number) {
  const previous = lastSeen ? Date.parse(lastSeen) : NaN;
  return !Number.isFinite(previous) || now - previous >= DEVICE_HEARTBEAT_INTERVAL_MS;
}

// Keep one request running and one trailing refresh so changes arriving during
// a request are not lost. Callers await the trailing result as well.
export function createRefreshQueue() {
  let running: Promise<void> | null = null;
  let next: (() => Promise<void>) | null = null;
  return (work: () => Promise<void>): Promise<void> => {
    next = work;
    if (!running) {
      running = Promise.resolve().then(async () => {
        while (next) {
          const current = next;
          next = null;
          await current();
        }
      }).finally(() => { running = null; next = null; });
    }
    return running;
  };
}
