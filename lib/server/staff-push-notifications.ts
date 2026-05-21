import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PushPortal = "admin" | "cleaner" | "grounds" | "owner";

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

let vapidConfigured = false;

const DEFAULT_VAPID_PUBLIC_KEY = "BDetbzBPxu1z9Qzcp7t4pRnce_wS_SbHnTTabNHohR7Li1rJaKfgHBs_AlGkl9AfG4qf6fxTNwiWwqkiWGBTEK4";

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
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:onboarding@estateofmindpm.com";

  if (!publicKey) {
    return "Push notifications need a valid VAPID public key.";
  }

  if (!isValidVapidPrivateKey(privateKey)) {
    return "Push notifications need a valid VAPID_PRIVATE_KEY.";
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
    .select("id, subscription")
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

  for (const row of data ?? []) {
    try {
      await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify({
          ...payload,
          icon: "/estateoslogo.png",
          badge: "/estateoslogo.png",
        })
      );
      sent += 1;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
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

  return { sent, skipped, errors };
}
