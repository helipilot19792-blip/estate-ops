import "server-only";

import crypto from "node:crypto";

type ServiceClient = any;

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  persistent: boolean;
};

const USER_MINUTE_LIMIT = 10;
const IP_MINUTE_LIMIT = 30;
const USER_DAILY_LIMIT = 100;
const fallbackRequests = new Map<string, number[]>();

function isMissingRateLimitTable(error: { code?: string | null; message?: string | null } | null) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    message.includes("help_assistant_requests") ||
    message.includes("could not find the table")
  );
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  ).slice(0, 128);
}

function hashIp(request: Request) {
  const secret =
    process.env.HELP_ASSISTANT_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-help-rate-limit";
  return crypto.createHmac("sha256", secret).update(getClientIp(request)).digest("hex");
}

function checkFallbackLimit(userId: string, ipHash: string, nowMs: number): RateLimitResult {
  const minuteStart = nowMs - 60_000;
  const dayStart = nowMs - 24 * 60 * 60 * 1000;
  const userKey = `user:${userId}`;
  const ipKey = `ip:${ipHash}`;
  const userRequests = (fallbackRequests.get(userKey) || []).filter((time) => time >= dayStart);
  const ipRequests = (fallbackRequests.get(ipKey) || []).filter((time) => time >= minuteStart);
  const userMinuteCount = userRequests.filter((time) => time >= minuteStart).length;

  if (
    userMinuteCount >= USER_MINUTE_LIMIT ||
    ipRequests.length >= IP_MINUTE_LIMIT ||
    userRequests.length >= USER_DAILY_LIMIT
  ) {
    return { allowed: false, retryAfterSeconds: 60, persistent: false };
  }

  fallbackRequests.set(userKey, [...userRequests, nowMs]);
  fallbackRequests.set(ipKey, [...ipRequests, nowMs]);
  return { allowed: true, retryAfterSeconds: 0, persistent: false };
}

export async function consumeHelpAssistantQuota(
  service: ServiceClient,
  request: Request,
  userId: string,
  now = new Date()
): Promise<RateLimitResult> {
  const ipHash = hashIp(request);
  const minuteStart = new Date(now.getTime() - 60_000).toISOString();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [userMinute, ipMinute, userDay] = await Promise.all([
    service
      .from("help_assistant_requests")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .gte("created_at", minuteStart),
    service
      .from("help_assistant_requests")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", minuteStart),
    service
      .from("help_assistant_requests")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .gte("created_at", dayStart),
  ]);

  const queryError = userMinute.error || ipMinute.error || userDay.error;
  if (queryError) {
    if (isMissingRateLimitTable(queryError)) {
      console.warn("[help-assistant] persistent rate-limit table is not installed; using local fallback");
      return checkFallbackLimit(userId, ipHash, now.getTime());
    }
    throw new Error("Help assistant quota could not be checked.");
  }

  if (
    (userMinute.count ?? 0) >= USER_MINUTE_LIMIT ||
    (ipMinute.count ?? 0) >= IP_MINUTE_LIMIT ||
    (userDay.count ?? 0) >= USER_DAILY_LIMIT
  ) {
    return { allowed: false, retryAfterSeconds: 60, persistent: true };
  }

  const { error: insertError } = await service.from("help_assistant_requests").insert({
    profile_id: userId,
    ip_hash: ipHash,
  });
  if (insertError) throw new Error("Help assistant quota could not be recorded.");

  return { allowed: true, retryAfterSeconds: 0, persistent: true };
}
