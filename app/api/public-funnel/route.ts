import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { PublicFunnelEventKey } from "@/lib/public-funnel";

export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "gulera_funnel_visitor";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const ALLOWED_EVENTS = new Set<PublicFunnelEventKey>([
  "signup_view",
  "signup_attempt",
  "signup_account_created",
  "trial_created",
  "demo_view",
  "demo_interaction",
]);
const BOT_PATTERN = /bot|crawler|spider|preview|headless|lighthouse|uptime|monitor/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FunnelPayload = {
  eventKey?: string | null;
  path?: string | null;
  visitorId?: string | null;
  metadata?: Record<string, unknown> | null;
};

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing public funnel environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 8)
      .map(([key, item]) => [
        String(key).trim().slice(0, 40),
        ["string", "number", "boolean"].includes(typeof item)
          ? typeof item === "string"
            ? item.slice(0, 120)
            : item
          : null,
      ])
      .filter(([key]) => Boolean(key))
  );
}

function getReferrerHost(req: NextRequest) {
  const referrer = req.headers.get("referer");
  if (!referrer) return null;

  try {
    return new URL(referrer).host.slice(0, 160) || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ ok: false, error: "Cross-origin tracking is not allowed." }, { status: 403 });
    }

    const userAgent = req.headers.get("user-agent") || "";
    if (BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const body = (await req.json().catch(() => null)) as FunnelPayload | null;
    const eventKey = String(body?.eventKey || "").trim() as PublicFunnelEventKey;
    if (!ALLOWED_EVENTS.has(eventKey)) {
      return NextResponse.json({ ok: false, error: "Unknown funnel event." }, { status: 400 });
    }

    const rawPath = String(body?.path || "").trim();
    const path = rawPath.startsWith("/") ? rawPath.slice(0, 300) : null;
    const existingVisitorId = req.cookies.get(VISITOR_COOKIE)?.value || "";
    const suppliedVisitorId = String(body?.visitorId || "").trim();
    const visitorId = UUID_PATTERN.test(suppliedVisitorId)
      ? suppliedVisitorId
      : UUID_PATTERN.test(existingVisitorId)
        ? existingVisitorId
        : crypto.randomUUID();
    const eventDate = new Date().toISOString().slice(0, 10);
    const serviceClient = createServiceClient();

    const { error } = await serviceClient.from("public_funnel_events").upsert(
      {
        event_date: eventDate,
        visitor_id: visitorId,
        event_key: eventKey,
        path,
        referrer_host: getReferrerHost(req),
        metadata: sanitizeMetadata(body?.metadata),
      },
      {
        onConflict: "event_date,visitor_id,event_key",
        ignoreDuplicates: true,
      }
    );

    if (error) {
      const tableMissing = error.code === "42P01" || error.message.includes("public_funnel_events");
      return NextResponse.json(
        { ok: false, available: !tableMissing, error: tableMissing ? "Funnel tracking is not installed." : error.message },
        { status: tableMissing ? 202 : 500 }
      );
    }

    const response = NextResponse.json({ ok: true });
    if (visitorId !== existingVisitorId) {
      response.cookies.set(VISITOR_COOKIE, visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: VISITOR_COOKIE_MAX_AGE,
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected public funnel error.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
