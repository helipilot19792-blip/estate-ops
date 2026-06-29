import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PushPortal = "admin" | "cleaner" | "grounds" | "owner";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

type PushDelivery = {
  subscriptionId: string;
  profileId: string;
  portal: PushPortal;
  userAgent: string | null;
  endpointHost: string;
  ok: boolean;
  statusCode: number | null;
  error?: string;
};

let vapidConfigured = false;

const DEFAULT_VAPID_PUBLIC_KEY = "BMqODVFZyHzmPlYyb_nlVwHA2HacRBq7V1O5j-_4jFNj368GIDjqX5vrCytVoOxkWSSKo8zsO6tgTrCwT2TTGe4";

function base64UrlDecode(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from((value + padding).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function isValidVapidPublicKey(value?: string | null) {
  const key = String(value || "").trim();
  if (!key || key.startsWith("sk_")) return false;

  try {
    const decoded = base64UrlDecode(key);
    return decoded.length === 65 && decoded[0] === 4;
  } catch {
    return false;
  }
}

function isValidVapidPrivateKey(value?: string | null) {
  const key = String(value || "").trim();
  if (!key || key.startsWith("sk_")) return false;

  try {
    return base64UrlDecode(key).length === 32;
  } catch {
    return false;
  }
}

function describePrivateKeyIssue(value?: string | null) {
  const raw = String(value || "");
  const key = raw.trim();

  if (!key) return "VAPID_PRIVATE_KEY is missing or blank in production.";
  if (key.startsWith("sk_")) return "VAPID_PRIVATE_KEY is set to a Stripe-style key, not a VAPID key.";

  try {
    const decoded = base64UrlDecode(key);
    return `VAPID_PRIVATE_KEY has ${key.length} characters and decodes to ${decoded.length} bytes; it must decode to 32 bytes.`;
  } catch {
    return "VAPID_PRIVATE_KEY is not valid base64url text.";
  }
}

function describePrivateKeyValue(value?: string | null) {
  const raw = String(value || "");
  const key = raw.trim();

  if (!key) {
    return {
      present: false,
      rawLength: raw.length,
      trimmedLength: key.length,
      decodedBytes: null as number | null,
      startsWithSk: false,
      valid: false,
    };
  }

  let decodedBytes: number | null = null;
  try {
    decodedBytes = base64UrlDecode(key).length;
  } catch {
    decodedBytes = null;
  }

  return {
    present: true,
    rawLength: raw.length,
    trimmedLength: key.length,
    decodedBytes,
    startsWithSk: key.startsWith("sk_"),
    valid: isValidVapidPrivateKey(key),
  };
}

export function getPushEnvironmentDiagnostics() {
  const privateCandidates = [
    ["GULERA_PUSH_SIGNING", process.env.GULERA_PUSH_SIGNING],
    ["GULERA_VAPID_PRIVATE_KEY", process.env.GULERA_VAPID_PRIVATE_KEY],
    ["VAPID_PRIVATE_KEY", process.env.VAPID_PRIVATE_KEY],
  ] as const;
  const selectedPrivate = privateCandidates.find(([, value]) => isValidVapidPrivateKey(value));

  return {
    publicKeyValid: isValidVapidPublicKey(getVapidPublicKey()),
    selectedPrivateKeyName: selectedPrivate?.[0] || null,
    privateKeys: Object.fromEntries(
      privateCandidates.map(([name, value]) => [name, describePrivateKeyValue(value)])
    ),
  };
}

function getVapidPublicKey() {
  const candidates = [
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PUBLIC_KEY,
    DEFAULT_VAPID_PUBLIC_KEY,
  ];

  return candidates.find(isValidVapidPublicKey) || "";
}

function configureVapid() {
  const publicKey = getVapidPublicKey();
  const privateKey =
    process.env.GULERA_PUSH_SIGNING ||
    process.env.GULERA_VAPID_PRIVATE_KEY ||
    process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:onboarding@estateofmindpm.com";

  if (!publicKey) {
    return "Push notifications need a valid VAPID public key.";
  }

  if (!isValidVapidPrivateKey(privateKey)) {
    return describePrivateKeyIssue(privateKey);
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey!);
    vapidConfigured = true;
  }

  return null;
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function sendStaffPushNotifications(
  portal: PushPortal,
  profileIds: string[],
  payload: PushPayload
) {
  const vapidError = configureVapid();
  if (vapidError) {
    return {
      sent: 0,
      skipped: profileIds.length,
      errors: [vapidError],
    };
  }

  const uniqueProfileIds = [...new Set(profileIds.filter(Boolean))];
  if (uniqueProfileIds.length === 0) {
    return { sent: 0, skipped: 0, errors: [] as string[] };
  }

  const service = getServiceClient();
  const { data, error } = await service
    .from("staff_push_subscriptions")
    .select("id, profile_id, portal, subscription, user_agent, endpoint")
    .eq("portal", portal)
    .in("profile_id", uniqueProfileIds)
    .is("disabled_at", null);

  if (error) {
    throw new Error(error.message);
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];
  const staleSubscriptionIds: string[] = [];
  const deliveries: PushDelivery[] = [];

  function getEndpointHost(endpoint?: string | null) {
    try {
      return new URL(String(endpoint || "")).host;
    } catch {
      return "";
    }
  }

  for (const row of data ?? []) {
    try {
      const response = await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify({
          ...payload,
          icon: "/estateoslogo.png",
          badge: "/notification-badge.png",
        }),
        {
          TTL: 60 * 60 * 24 * 28,
          urgency: "high",
        }
      );
      deliveries.push({
        subscriptionId: row.id,
        profileId: row.profile_id,
        portal: row.portal as PushPortal,
        userAgent: row.user_agent,
        endpointHost: getEndpointHost(row.endpoint),
        ok: true,
        statusCode: Number(response.statusCode || 0) || null,
      });
      sent += 1;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      deliveries.push({
        subscriptionId: row.id,
        profileId: row.profile_id,
        portal: row.portal as PushPortal,
        userAgent: row.user_agent,
        endpointHost: getEndpointHost(row.endpoint),
        ok: false,
        statusCode: statusCode || null,
        error: error?.message || "Push notification failed.",
      });
      if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 410) {
        staleSubscriptionIds.push(row.id);
        skipped += 1;
        continue;
      }

      errors.push(error?.message || "Push notification failed.");
    }
  }

  if (staleSubscriptionIds.length > 0) {
    await service
      .from("staff_push_subscriptions")
      .update({
        disabled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", staleSubscriptionIds);
  }

  return { sent, skipped, errors, deliveries };
}
