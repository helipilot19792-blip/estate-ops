import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ORGANIZATION_TRIAL_DAYS = 30;

type PlatformSignupSettingsRow = {
  id: boolean;
  beta_signup_enabled?: boolean | null;
  beta_signup_limit?: number | null;
};

function slugifyCompanyName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeOrganizationType(value: unknown) {
  return value === "cleaning_company" ? "cleaning_company" : "property_management";
}

function isMissingBetaSignupControlsError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message || "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    message.includes("platform_settings") ||
    message.includes("beta_signup_enabled") ||
    message.includes("beta_signup_limit")
  );
}

async function loadBetaSignupState(service: SupabaseClient<any, "public", any>) {
  const { data: settings, error: settingsError } = await service
    .from("platform_settings")
    .select("id,beta_signup_enabled,beta_signup_limit")
    .eq("id", true)
    .maybeSingle();

  if (settingsError && !isMissingBetaSignupControlsError(settingsError)) {
    throw new Error(settingsError.message);
  }

  let signupCountResult = await service
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .or("account_type.is.null,account_type.neq.internal");

  if (signupCountResult.error?.code === "42703") {
    signupCountResult = await service
      .from("organizations")
      .select("id", { count: "exact", head: true });
  }

  if (signupCountResult.error) {
    throw new Error(signupCountResult.error.message);
  }

  const row = settings as PlatformSignupSettingsRow | null;
  const limit =
    isMissingBetaSignupControlsError(settingsError) || row?.beta_signup_limit === undefined
      ? null
      : row?.beta_signup_limit === null
        ? null
        : Number.isFinite(Number(row.beta_signup_limit))
          ? Number(row.beta_signup_limit)
          : null;

  return {
    enabled: isMissingBetaSignupControlsError(settingsError) ? true : row?.beta_signup_enabled !== false,
    limit,
    count: signupCountResult.count ?? 0,
  };
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signupState = await loadBetaSignupState(service);
    const signupOpen =
      signupState.enabled &&
      (signupState.limit === null || signupState.count < signupState.limit);

    return NextResponse.json({
      ok: true,
      signupOpen,
      signupEnabled: signupState.enabled,
      signupLimit: signupState.limit,
      signupCount: signupState.count,
      signupRemaining:
        typeof signupState.limit === "number"
          ? Math.max(signupState.limit - signupState.count, 0)
          : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load signup availability.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing server environment variables." },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const metadata = user.user_metadata || {};
    const fullName =
      (typeof body?.fullName === "string" ? body.fullName.trim() : "") ||
      (typeof metadata.full_name === "string" ? metadata.full_name.trim() : "");
    const phone =
      (typeof body?.phone === "string" ? body.phone.trim() : "") ||
      (typeof metadata.phone === "string" ? metadata.phone.trim() : "");
    const companyName =
      (typeof body?.companyName === "string" ? body.companyName.trim() : "") ||
      (typeof metadata.company_name === "string" ? metadata.company_name.trim() : "");
    const organizationType = normalizeOrganizationType(
      typeof body?.organizationType === "string" ? body.organizationType : metadata.organization_type
    );

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signupState = await loadBetaSignupState(service);

    if (!signupState.enabled) {
      return NextResponse.json(
        { error: "New user signup is paused right now. Please contact support to join the beta." },
        { status: 403 }
      );
    }

    if (typeof signupState.limit === "number" && signupState.count >= signupState.limit) {
      return NextResponse.json(
        {
          error: `Beta signup is currently full (${signupState.count}/${signupState.limit}). Please contact support to be added to the waitlist.`,
        },
        { status: 403 }
      );
    }

    if (!fullName || !phone || !companyName) {
      return NextResponse.json({ error: "Missing new user signup details." }, { status: 400 });
    }

    const { data: existingMembership, error: membershipLookupError } = await service
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipLookupError) {
      return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
    }

    if (existingMembership) {
      return NextResponse.json(
        { error: "This account is already linked to a company workspace." },
        { status: 409 }
      );
    }

    const { error: profileError } = await service
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        role: "admin",
      })
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const baseSlug = slugifyCompanyName(companyName);
    const uniqueSlug = `${baseSlug || "company"}-${Date.now().toString().slice(-6)}`;
    const trialStartedAt = new Date();
    const trialEndsAt = new Date(trialStartedAt);
    trialEndsAt.setDate(trialEndsAt.getDate() + ORGANIZATION_TRIAL_DAYS);

    const organizationInsert = {
      name: companyName,
      slug: uniqueSlug,
      created_by: user.id,
      organization_type: organizationType,
      subscription_status: "trialing",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      billing_enabled: false,
    };

    let organizationResult = await service
      .from("organizations")
      .insert(organizationInsert)
      .select("id")
      .single();

    if (organizationResult.error?.code === "42703") {
      const fallbackInsert = {
        name: companyName,
        slug: uniqueSlug,
        created_by: user.id,
        subscription_status: "trialing",
        trial_started_at: trialStartedAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        billing_enabled: false,
      };
      organizationResult = await service
        .from("organizations")
        .insert(fallbackInsert)
        .select("id")
        .single();
    }

    const { data: organization, error: organizationError } = organizationResult;

    if (organizationError || !organization) {
      return NextResponse.json(
        { error: organizationError?.message || "Failed to create organization." },
        { status: 500 }
      );
    }

    const { error: memberError } = await service.from("organization_members").insert({
      organization_id: organization.id,
      profile_id: user.id,
      role: "admin",
    });

    if (memberError) {
      await service.from("organizations").delete().eq("id", organization.id);
      await service.from("profiles").update({ role: "pending" }).eq("id", user.id);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    return NextResponse.json({
      organizationId: organization.id,
      trialDays: ORGANIZATION_TRIAL_DAYS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "New user signup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
