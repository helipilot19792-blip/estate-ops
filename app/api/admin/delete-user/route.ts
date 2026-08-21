import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: currentProfile, error: currentProfileError } = await service
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (
      currentProfileError ||
      !currentProfile ||
      (currentProfile.role !== "admin" && currentProfile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const profileId = typeof body?.profileId === "string" ? body.profileId.trim() : "";
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";

    if (!profileId || !organizationId) {
      return NextResponse.json(
        { error: "Missing profileId or organizationId." },
        { status: 400 }
      );
    }

    if (profileId === user.id) {
      return NextResponse.json(
        { error: "You cannot permanently delete your own account." },
        { status: 400 }
      );
    }

    const { data: callerMembership, error: callerMembershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (callerMembershipError) {
      return NextResponse.json({ error: callerMembershipError.message }, { status: 500 });
    }

    if (currentProfile.role !== "platform_admin" && callerMembership?.role !== "admin") {
      return NextResponse.json(
        { error: "You do not have admin access to this organization." },
        { status: 403 }
      );
    }

    const { data: targetMembership, error: targetMembershipError } = await service
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
        { error: "User is not a member of this organization." },
        { status: 404 }
      );
    }

    const { count: otherOrganizationCount, error: otherOrganizationError } = await service
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .neq("organization_id", organizationId);

    if (otherOrganizationError) {
      return NextResponse.json({ error: otherOrganizationError.message }, { status: 500 });
    }

    const [ownerLinks, cleanerMemberships, groundsMemberships] = await Promise.all([
      service
        .from("owner_accounts")
        .select("id")
        .eq("profile_id", profileId)
        .neq("organization_id", organizationId)
        .limit(1),
      service
        .from("cleaner_account_members")
        .select("cleaner_account_id")
        .eq("profile_id", profileId),
      service
        .from("grounds_account_members")
        .select("grounds_account_id")
        .eq("profile_id", profileId),
    ]);

    const relatedLookupError =
      ownerLinks.error || cleanerMemberships.error || groundsMemberships.error;
    if (relatedLookupError) {
      return NextResponse.json({ error: relatedLookupError.message }, { status: 500 });
    }

    const cleanerAccountIds = (cleanerMemberships.data || [])
      .map((row) => row.cleaner_account_id)
      .filter(Boolean);
    const groundsAccountIds = (groundsMemberships.data || [])
      .map((row) => row.grounds_account_id)
      .filter(Boolean);

    const [outsideCleanerAccounts, outsideGroundsAccounts] = await Promise.all([
      cleanerAccountIds.length > 0
        ? service
            .from("cleaner_accounts")
            .select("id")
            .in("id", cleanerAccountIds)
            .neq("organization_id", organizationId)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
      groundsAccountIds.length > 0
        ? service
            .from("grounds_accounts")
            .select("id")
            .in("id", groundsAccountIds)
            .neq("organization_id", organizationId)
            .limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const outsideAccountError = outsideCleanerAccounts.error || outsideGroundsAccounts.error;
    if (outsideAccountError) {
      return NextResponse.json({ error: outsideAccountError.message }, { status: 500 });
    }

    const hasOutsideOrganizationLinks =
      (otherOrganizationCount ?? 0) > 0 ||
      (ownerLinks.data?.length ?? 0) > 0 ||
      (outsideCleanerAccounts.data?.length ?? 0) > 0 ||
      (outsideGroundsAccounts.data?.length ?? 0) > 0;

    if (hasOutsideOrganizationLinks && currentProfile.role !== "platform_admin") {
      return NextResponse.json(
        {
          error:
            "This user also belongs to another organization and cannot be permanently deleted here.",
        },
        { status: 409 }
      );
    }

    if (targetMembership.role === "admin" && currentProfile.role !== "platform_admin") {
      const { data: organization, error: organizationError } = await service
        .from("organizations")
        .select("created_by")
        .eq("id", organizationId)
        .maybeSingle();

      if (organizationError) {
        return NextResponse.json({ error: organizationError.message }, { status: 500 });
      }

      if (organization?.created_by !== user.id) {
        return NextResponse.json(
          { error: "Only the primary admin can permanently delete another admin." },
          { status: 403 }
        );
      }
    }

    const adminCountRes = await service
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "admin");

    if (adminCountRes.error) {
      return NextResponse.json(
        { error: adminCountRes.error.message },
        { status: 500 }
      );
    }

    const { data: targetProfile, error: targetProfileError } = await service
      .from("profiles")
      .select("id, role, email, full_name")
      .eq("id", profileId)
      .single();

    if (targetProfileError || !targetProfile) {
      return NextResponse.json({ error: "User profile not found." }, { status: 404 });
    }

    if (targetMembership.role === "admin" && (adminCountRes.count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You cannot delete the last admin." },
        { status: 400 }
      );
    }

    const acceptedClear = await service
      .from("turnover_job_slots")
      .update({ accepted_by_profile_id: null })
      .eq("accepted_by_profile_id", profileId);

    if (acceptedClear.error) {
      return NextResponse.json(
        { error: acceptedClear.error.message },
        { status: 500 }
      );
    }

    const declinedClear = await service
      .from("turnover_job_slots")
      .update({ declined_by_profile_id: null })
      .eq("declined_by_profile_id", profileId);

    if (declinedClear.error) {
      return NextResponse.json(
        { error: declinedClear.error.message },
        { status: 500 }
      );
    }

    const membershipDelete = await service
      .from("cleaner_account_members")
      .delete()
      .eq("profile_id", profileId);

    if (membershipDelete.error) {
      return NextResponse.json(
        { error: membershipDelete.error.message },
        { status: 500 }
      );
    }

    const profileDelete = await service.from("profiles").delete().eq("id", profileId);

    if (profileDelete.error) {
      return NextResponse.json(
        { error: profileDelete.error.message },
        { status: 500 }
      );
    }

    const authDelete = await service.auth.admin.deleteUser(profileId);

    if (authDelete.error) {
      return NextResponse.json(
        { error: authDelete.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${targetProfile.full_name || targetProfile.email || "user"} permanently.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
