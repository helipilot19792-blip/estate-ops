import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TeamKind = "cleaner" | "grounds";

function getTables(kind: TeamKind) {
  return kind === "cleaner"
    ? {
        accountTable: "cleaner_accounts",
        memberTable: "cleaner_account_members",
        assignmentTable: "property_cleaner_account_assignments",
        accountIdColumn: "cleaner_account_id",
      }
    : {
        accountTable: "grounds_accounts",
        memberTable: "grounds_account_members",
        assignmentTable: "property_grounds_account_assignments",
        accountIdColumn: "grounds_account_id",
      };
}

function roleCanBeAssigned(kind: TeamKind, role: string | null | undefined) {
  if (kind === "cleaner") return role === "cleaner";
  return role === "grounds" || role === "cleaner";
}

export async function POST(request: NextRequest) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
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
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const profileId = String(body?.profileId || "").trim();
    const requestedAccountId = String(body?.accountId || "").trim();
    const priority = Number(body?.priority || 1);
    const kind = body?.kind === "grounds" ? "grounds" : body?.kind === "cleaner" ? "cleaner" : null;

    if (!organizationId || !propertyId || !kind || (!profileId && !requestedAccountId)) {
      return NextResponse.json({ error: "Missing assignment details." }, { status: 400 });
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 3) {
      return NextResponse.json({ error: "Choose a valid assignment priority." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: currentProfile, error: currentProfileError } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (currentProfileError) {
      return NextResponse.json({ error: currentProfileError.message }, { status: 500 });
    }

    if (
      !currentProfile ||
      (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    if (currentProfile.role !== "platform_admin") {
      const { data: adminMembership, error: adminMembershipError } = await serviceClient
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (adminMembershipError) {
        return NextResponse.json({ error: adminMembershipError.message }, { status: 500 });
      }

      if (!adminMembership) {
        return NextResponse.json(
          { error: "Admin access required for this organization." },
          { status: 403 }
        );
      }
    }

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found in this organization." }, { status: 404 });
    }

    const tables = getTables(kind);
    let accountId: string | null = null;

    if (requestedAccountId) {
      const { data: existingAccount, error: existingAccountError } = await serviceClient
        .from(tables.accountTable)
        .select("id, active")
        .eq("organization_id", organizationId)
        .eq("id", requestedAccountId)
        .maybeSingle();

      if (existingAccountError) {
        return NextResponse.json({ error: existingAccountError.message }, { status: 500 });
      }

      if (!existingAccount) {
        return NextResponse.json({ error: "Selected account is not linked to this organization." }, { status: 400 });
      }

      if (existingAccount.active === false) {
        return NextResponse.json({ error: "Selected account is inactive." }, { status: 400 });
      }

      accountId = existingAccount.id;
    } else {
      const { data: targetProfile, error: targetProfileError } = await serviceClient
        .from("profiles")
        .select("id, role, email, full_name, phone")
        .eq("id", profileId)
        .maybeSingle();

      if (targetProfileError) {
        return NextResponse.json({ error: targetProfileError.message }, { status: 500 });
      }

      if (!targetProfile || !roleCanBeAssigned(kind, targetProfile.role)) {
        return NextResponse.json({ error: "Selected user is not eligible for this assignment." }, { status: 400 });
      }

      const { data: targetMembership, error: targetMembershipError } = await serviceClient
        .from("organization_members")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (targetMembershipError) {
        return NextResponse.json({ error: targetMembershipError.message }, { status: 500 });
      }

      if (!targetMembership) {
        return NextResponse.json(
          { error: "Selected user is not linked to this organization." },
          { status: 400 }
        );
      }

      const { data: existingMemberships, error: existingMembershipError } = await serviceClient
        .from(tables.memberTable)
        .select(tables.accountIdColumn)
        .eq("profile_id", profileId);

      if (existingMembershipError) {
        return NextResponse.json({ error: existingMembershipError.message }, { status: 500 });
      }

      const existingAccountIds = (existingMemberships || [])
        .map((membership: any) => membership?.[tables.accountIdColumn] as string | undefined)
        .filter(Boolean) as string[];

      if (existingAccountIds.length > 0) {
        const { data: existingAccount, error: existingAccountError } = await serviceClient
          .from(tables.accountTable)
          .select("id")
          .eq("organization_id", organizationId)
          .in("id", existingAccountIds)
          .limit(1)
          .maybeSingle();

        if (existingAccountError) {
          return NextResponse.json({ error: existingAccountError.message }, { status: 500 });
        }

        accountId = existingAccount?.id || null;
      }

      if (!accountId) {
        const { data: insertedAccount, error: insertedAccountError } = await serviceClient
          .from(tables.accountTable)
          .insert({
            organization_id: organizationId,
            display_name:
              targetProfile.full_name || targetProfile.email || `${kind === "cleaner" ? "Cleaner" : "Grounds"} account`,
            email: targetProfile.email || null,
            phone: targetProfile.phone || null,
            active: true,
          })
          .select("id")
          .single();

        if (insertedAccountError || !insertedAccount) {
          return NextResponse.json(
            { error: insertedAccountError?.message || `Could not create ${kind} account.` },
            { status: 500 }
          );
        }

        accountId = insertedAccount.id;

        const { error: memberInsertError } = await serviceClient
          .from(tables.memberTable)
          .insert({
            [tables.accountIdColumn]: accountId,
            profile_id: profileId,
          });

        if (memberInsertError) {
          return NextResponse.json({ error: memberInsertError.message }, { status: 500 });
        }
      }
    }
    const { data: assignment, error: assignmentError } = await serviceClient
      .from(tables.assignmentTable)
      .insert({
        property_id: propertyId,
        [tables.accountIdColumn]: accountId,
        priority,
      })
      .select("*")
      .single();

    if (assignmentError) {
      return NextResponse.json({ error: assignmentError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      assignment,
      accountId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save assignment." },
      { status: 500 }
    );
  }
}
