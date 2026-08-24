export type PublicFunnelEventKey =
  | "signup_view"
  | "signup_attempt"
  | "signup_account_created"
  | "trial_created"
  | "demo_view"
  | "demo_interaction";

const trackedRecently = new Map<PublicFunnelEventKey, number>();
const TRACK_WINDOW_MS = 10 * 1000;
const CONSENT_KEY = "gulera_os_cookie_consent_v1";
const VISITOR_STORAGE_KEY = "gulera_funnel_visitor_v1";
const CONSENT_EVENT = "gulera-cookie-consent";

type PendingFunnelEvent = {
  eventKey: PublicFunnelEventKey;
  metadata: Record<string, string | number | boolean | null>;
  path: string;
};

const pendingEvents: PendingFunnelEvent[] = [];
let consentListenerInstalled = false;
let inMemoryVisitorId = "";

function hasAnalyticsConsent() {
  try {
    const consent = JSON.parse(window.localStorage.getItem(CONSENT_KEY) || "null") as {
      choice?: string;
    } | null;
    return consent?.choice === "all";
  } catch {
    return false;
  }
}

function getVisitorId() {
  if (inMemoryVisitorId) return inMemoryVisitorId;

  const visitorId = window.crypto.randomUUID();

  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) {
      inMemoryVisitorId = existing;
      return existing;
    }
    window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  } catch {
    // Private browsing or hardened browser settings can block local storage.
  }

  inMemoryVisitorId = visitorId;
  return visitorId;
}

function sendFunnelEvent(event: PendingFunnelEvent) {
  void fetch("/api/public-funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventKey: event.eventKey,
      path: event.path,
      metadata: event.metadata,
      visitorId: getVisitorId(),
    }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    // Funnel tracking should never interrupt signup or demo use.
  });
}

function ensureConsentListener() {
  if (consentListenerInstalled) return;
  consentListenerInstalled = true;

  window.addEventListener(CONSENT_EVENT, (event) => {
    const choice = (event as CustomEvent<{ choice?: string }>).detail?.choice;
    if (choice !== "all") {
      pendingEvents.length = 0;
      return;
    }

    pendingEvents.splice(0).forEach(sendFunnelEvent);
  });
}

export function trackPublicFunnelEvent(
  eventKey: PublicFunnelEventKey,
  metadata: Record<string, string | number | boolean | null> = {}
) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - (trackedRecently.get(eventKey) || 0) < TRACK_WINDOW_MS) return;
  trackedRecently.set(eventKey, now);

  const event = {
    eventKey,
    path: `${window.location.pathname}${window.location.search}`,
    metadata,
  };

  if (hasAnalyticsConsent()) {
    sendFunnelEvent(event);
    return;
  }

  ensureConsentListener();
  pendingEvents.push(event);
}
