import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signOwnerEmail } from "@/lib/server/owner-link-signature";
import { writeAuditLog } from "@/lib/server/audit-log";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
}

if (!publicSupabaseKey) {
  throw new Error(
    "Missing public Supabase key. Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
}

function getOwnerWelcomeUrl(ownerEmail: string, requestOrigin: string) {
  const url = new URL("/owner/welcome", requestOrigin);
  url.searchParams.set("owner_email", ownerEmail);
  url.searchParams.set("sig", signOwnerEmail(ownerEmail));
  return url.toString();
}

async function findAuthUserByEmail(
  serviceClient: any,
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((candidate: any) => {
      return candidate.email?.trim().toLowerCase() === normalizedEmail;
    });

    if (match) {
      return match;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, publicSupabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role, email")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (profile.role !== "admin" && profile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
    const ownerName = String(body.ownerName || "").trim();

    if (!propertyId) {
      return NextResponse.json({ error: "Property is required." }, { status: 400 });
    }

    if (!ownerEmail) {
      return NextResponse.json({ error: "Owner email is required." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const ownerWelcomeUrl = getOwnerWelcomeUrl(ownerEmail, new URL(request.url).origin);
    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id, name")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property?.organization_id) {
      return NextResponse.json({ error: "Property not found." }, { status: 404 });
    }

    if (profile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await serviceClient
        .from("organization_members")
        .select("organization_id, role")
        .eq("organization_id", property.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json({ error: "You do not have access to this property." }, { status: 403 });
      }
    }

    let ownerAccountId: string | null = null;

    const { data: existingOwner, error: existingOwnerError } = await serviceClient
      .from("owner_accounts")
      .select("*")
      .eq("organization_id", property.organization_id)
      .eq("email", ownerEmail)
      .maybeSingle();

    if (existingOwnerError) {
      return NextResponse.json({ error: existingOwnerError.message }, { status: 500 });
    }

    if (existingOwner) {
      ownerAccountId = existingOwner.id;

      const updates: Record<string, unknown> = {
        invite_sent_at: new Date().toISOString(),
      };

      if (ownerName && !existingOwner.full_name) {
        updates.full_name = ownerName;
      }

      const { error: updateOwnerError } = await serviceClient
        .from("owner_accounts")
        .update(updates)
        .eq("id", existingOwner.id);

      if (updateOwnerError) {
        return NextResponse.json({ error: updateOwnerError.message }, { status: 500 });
      }
    } else {
      const { data: insertedOwner, error: insertOwnerError } = await serviceClient
        .from("owner_accounts")
        .insert({
          organization_id: property.organization_id,
          email: ownerEmail,
          full_name: ownerName || null,
          is_active: true,
          invite_sent_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertOwnerError || !insertedOwner) {
        return NextResponse.json(
          { error: insertOwnerError?.message || "Could not create owner account." },
          { status: 500 }
        );
      }

      ownerAccountId = insertedOwner.id;
    }

    const { data: existingAccess, error: existingAccessError } = await serviceClient
      .from("owner_property_access")
      .select("id")
      .eq("owner_account_id", ownerAccountId)
      .eq("property_id", propertyId)
      .maybeSingle();

    if (existingAccessError) {
      return NextResponse.json({ error: existingAccessError.message }, { status: 500 });
    }

    if (!existingAccess) {
      const { error: accessInsertError } = await serviceClient
        .from("owner_property_access")
        .insert({
          owner_account_id: ownerAccountId,
          property_id: propertyId,
        });

      if (accessInsertError) {
        return NextResponse.json({ error: accessInsertError.message }, { status: 500 });
      }
    }

    const existingAuthUser = await findAuthUserByEmail(serviceClient, ownerEmail);
    const userExists = !!existingAuthUser;

    let authError: { message: string } | null = null;

    if (userExists) {
      const { error } = await serviceClient.auth.signInWithOtp({
        email: ownerEmail,
        options: {
          emailRedirectTo: ownerWelcomeUrl,
          shouldCreateUser: false,
          data: {
            role: "owner",
            owner_email: ownerEmail,
            owner_name: ownerName || null,
          },
        },
      });

      authError = error;
    } else {
      const { error } = await serviceClient.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: ownerWelcomeUrl,
        data: {
          role: "owner",
          owner_email: ownerEmail,
          owner_name: ownerName || null,
        },
      });

      authError = error;
    }

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    await writeAuditLog(serviceClient, {
      actorProfileId: profile.id,
      actorEmail: profile.email || user.email || null,
      actorRole: profile.role,
      organizationId: property.organization_id,
      actionType: "admin.invite_owner",
      targetType: "owner_account",
      targetId: ownerAccountId,
      metadata: {
        property_id: propertyId,
        property_name: property.name || null,
        owner_email: ownerEmail,
        owner_name: ownerName || null,
        auth_user_exists: userExists,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
