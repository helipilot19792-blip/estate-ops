import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
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

const ownerWelcomeUrl = "https://portal.estateofmindpm.com/owner/welcome";

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
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin") {
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

    let ownerAccountId: string | null = null;

    const { data: existingOwner, error: existingOwnerError } = await serviceClient
      .from("owner_accounts")
      .select("*")
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

    const { data: usersList, error: listUsersError } = await serviceClient.auth.admin.listUsers();

    if (listUsersError) {
      return NextResponse.json({ error: listUsersError.message }, { status: 500 });
    }

    const userExists = (usersList?.users ?? []).some(
      (u) => u.email?.toLowerCase() === ownerEmail
    );

    let authError: { message: string } | null = null;

    if (userExists) {
      const { error } = await serviceClient.auth.signInWithOtp({
        email: ownerEmail,
        options: {
          emailRedirectTo: ownerWelcomeUrl,
        },
      });

      authError = error;
    } else {
      const { error } = await serviceClient.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: ownerWelcomeUrl,
        data: {
          role: "owner",
          owner_name: ownerName || null,
        },
      });

      authError = error;
    }

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}