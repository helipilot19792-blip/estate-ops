import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function requireAdmin(serviceClient: any, userId: string, organizationId: string) {
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) return false;
  if (profile.role === "platform_admin") return true;

  const { data: membership, error: membershipError } = await serviceClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (membershipError) throw membershipError;
  return !!membership;
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const propertyId = String(body?.propertyId || "").trim();
    const ownerEmail = String(body?.ownerEmail || "").trim().toLowerCase();
    const ownerName = String(body?.ownerName || "").trim();

    if (!propertyId) {
      return NextResponse.json({ error: "Property is required." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property?.organization_id) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    const hasAdminAccess = await requireAdmin(serviceClient, user.id, property.organization_id);
    if (!hasAdminAccess) {
      return NextResponse.json({ error: "Admin access required for this property." }, { status: 403 });
    }

    const { data: existingAccess, error: existingAccessError } = await serviceClient
      .from("owner_property_access")
      .select("id, owner_account_id")
      .eq("property_id", propertyId)
      .maybeSingle();

    if (existingAccessError) {
      return NextResponse.json({ error: existingAccessError.message }, { status: 500 });
    }

    if (!ownerEmail) {
      if (existingAccess) {
        const { error: deleteAccessError } = await serviceClient
          .from("owner_property_access")
          .delete()
          .eq("id", existingAccess.id);

        if (deleteAccessError) {
          return NextResponse.json({ error: deleteAccessError.message }, { status: 500 });
        }
      }

      return NextResponse.json({ ok: true, ownerAccountId: null, removed: true });
    }

    const { data: existingOwner, error: existingOwnerError } = await serviceClient
      .from("owner_accounts")
      .select("id, full_name")
      .eq("organization_id", property.organization_id)
      .ilike("email", ownerEmail)
      .limit(1)
      .maybeSingle();

    if (existingOwnerError) {
      return NextResponse.json({ error: existingOwnerError.message }, { status: 500 });
    }

    let ownerAccountId = existingOwner?.id || null;

    if (existingOwner) {
      const updates: Record<string, unknown> = {};
      if (ownerName && ownerName !== (existingOwner.full_name || "")) {
        updates.full_name = ownerName;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateOwnerError } = await serviceClient
          .from("owner_accounts")
          .update(updates)
          .eq("id", existingOwner.id);

        if (updateOwnerError) {
          return NextResponse.json({ error: updateOwnerError.message }, { status: 500 });
        }
      }
    } else {
      const { data: insertedOwner, error: insertOwnerError } = await serviceClient
        .from("owner_accounts")
        .insert({
          organization_id: property.organization_id,
          email: ownerEmail,
          full_name: ownerName || null,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertOwnerError || !insertedOwner) {
        return NextResponse.json(
          { error: insertOwnerError?.message || "Could not create owner account." },
          { status: 500 }
        );
      }

      ownerAccountId = insertedOwner.id;
    }

    if (!ownerAccountId) {
      return NextResponse.json({ error: "Could not determine owner account." }, { status: 500 });
    }

    if (existingAccess) {
      const { error: updateAccessError } = await serviceClient
        .from("owner_property_access")
        .update({ owner_account_id: ownerAccountId })
        .eq("id", existingAccess.id);

      if (updateAccessError) {
        return NextResponse.json({ error: updateAccessError.message }, { status: 500 });
      }
    } else {
      const { error: insertAccessError } = await serviceClient.from("owner_property_access").insert({
        owner_account_id: ownerAccountId,
        property_id: propertyId,
      });

      if (insertAccessError) {
        return NextResponse.json({ error: insertAccessError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, ownerAccountId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save owner link." },
      { status: 500 }
    );
  }
}
