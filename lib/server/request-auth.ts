import "server-only";

import { createClient, type User } from "@supabase/supabase-js";

function getSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publicKey || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return { url, publicKey, serviceRoleKey };
}

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseEnvironment();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function authenticateBearerRequest(
  request: Request
): Promise<{ ok: true; user: User; token: string } | { ok: false; status: 401; error: string }> {
  const token = getBearerToken(request);
  if (!token) return { ok: false, status: 401, error: "Authentication required." };

  const { url, publicKey } = getSupabaseEnvironment();
  const authClient = createClient(url, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  return { ok: true, user, token };
}
