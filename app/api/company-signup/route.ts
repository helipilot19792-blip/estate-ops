import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ORGANIZATION_TRIAL_DAYS = 30;

function slugifyCompanyName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";

    if (!fullName || !phone || !companyName) {
      return NextResponse.json({ error: "Missing company signup details." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
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

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

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

    const { data: organization, error: organizationError } = await service
      .from("organizations")
      .insert({
        name: companyName,
        slug: uniqueSlug,
        created_by: user.id,
        subscription_status: "trialing",
        trial_started_at: trialStartedAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        billing_enabled: false,
      })
      .select("id")
      .single();

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
    const message = error instanceof Error ? error.message : "Company signup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
