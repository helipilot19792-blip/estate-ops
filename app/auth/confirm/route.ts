import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function getSafeNextPath(value: string | null) {
  if (!value) return "/login";
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/login";
  }

  return value;
}

export async function GET(req: NextRequest) {
  const requestUrl = new URL(req.url);

  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const tokenType = requestUrl.searchParams.get("type") || "email";
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (!code && !tokenHash) {
    console.warn("[auth/confirm] missing code or token_hash", { next });
    return NextResponse.redirect(new URL("/login?error=missing_code", req.url));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error("[auth/confirm] missing Supabase environment variables");
    return NextResponse.redirect(new URL("/login?error=confirm_config", req.url));
  }

  const redirectTo = new URL(next, req.url);
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: tokenType as any,
      });

  if (error) {
    console.error("[auth/confirm] code exchange failed", {
      next,
      message: error.message,
    });
    return NextResponse.redirect(new URL("/login?error=confirm_failed", req.url));
  }

  console.info("[auth/confirm] confirmed email and redirecting", { next });

  return response;
}
