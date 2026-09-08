import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

type TeamRole = "cleaner" | "grounds";

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
      .select("id, role, email")
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
    const inviteId = typeof body?.inviteId === "string" ? body.inviteId : null;
    const organizationId = typeof body?.organizationId === "string" ? body.organizationId : "";
    const requestedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const requestedRole = body?.role === "cleaner" || body?.role === "grounds" ? body.role : null;

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId." }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("organization_id, role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }

    if (membership?.role !== "admin" && currentProfile.role !== "platform_admin") {
      return NextResponse.json(
        { error: "You do not have access to this organization." },
        { status: 403 }
      );
    }

    let targetEmail = requestedEmail;
    let targetRole: TeamRole | null = requestedRole;

    if ((!targetEmail || !targetRole) && inviteId) {
      const { data: invite, error: inviteLookupError } = await service
        .from("organization_invites")
        .select("email, role")
        .eq("id", inviteId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (inviteLookupError) {
        return NextResponse.json({ error: inviteLookupError.message }, { status: 500 });
      }

      if (invite) {
        targetEmail = targetEmail || String(invite.email || "").trim().toLowerCase();
        targetRole =
          targetRole || (invite.role === "cleaner" || invite.role === "grounds" ? invite.role : null);
      }
    }

    if (!targetEmail || !targetRole) {
      return NextResponse.json(
        { error: "Choose a cleaner or grounds invite to remove." },
        { status: 400 }
      );
    }

    const accountTable = targetRole === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
    const memberTable = targetRole === "cleaner" ? "cleaner_account_members" : "grounds_account_members";
    const accountIdColumn = targetRole === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
    const slotTable = targetRole === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";

    const { data: accounts, error: accountLookupError } = await service
      .from(accountTable)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("email", targetEmail);

    if (accountLookupError) {
      return NextResponse.json({ error: accountLookupError.message }, { status: 500 });
    }

    const accountIds = (accounts || []).map((account) => account.id as string).filter(Boolean);
    const profileIds = new Set<string>();

    const { data: profilesByEmail, error: profileLookupError } = await service
      .from("profiles")
      .select("id, role")
      .eq("email", targetEmail);

    if (profileLookupError) {
      return NextResponse.json({ error: profileLookupError.message }, { status: 500 });
    }

    for (const profile of profilesByEmail || []) {
      if (profile?.id) profileIds.add(profile.id as string);
    }

    if (accountIds.length > 0) {
      const { data: accountMembers, error: accountMembersError } = await service
        .from(memberTable)
        .select("profile_id")
        .in(accountIdColumn, accountIds);

      if (accountMembersError) {
        return NextResponse.json({ error: accountMembersError.message }, { status: 500 });
      }

      for (const member of accountMembers || []) {
        if (member?.profile_id) profileIds.add(member.profile_id as string);
      }
    }

    const profileIdList = [...profileIds].filter((profileId) => profileId !== user.id);
    let removedInvites = 0;
    let removedAccountMembers = 0;
    let removedAccounts = 0;
    let removedOrgMembers = 0;
    const deletedLogins = 0;

    const { data: deletedInvites, error: inviteDeleteError } = await service
      .from("organization_invites")
      .delete()
      .eq("organization_id", organizationId)
      .eq("role", targetRole)
      .eq("email", targetEmail)
      .select("id");

    if (inviteDeleteError) {
      return NextResponse.json({ error: inviteDeleteError.message }, { status: 500 });
    }
    removedInvites = deletedInvites?.length || 0;

    if (profileIdList.length > 0 && accountIds.length > 0) {
      for (const column of ["accepted_by_profile_id", "declined_by_profile_id"]) {
        const { error } = await service
          .from(slotTable)
          .update({ [column]: null })
          .in(accountIdColumn, accountIds)
          .in(column, profileIdList);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (accountIds.length > 0) {
      const { data: deletedMembersByAccount, error: deleteMembersByAccountError } = await service
        .from(memberTable)
        .delete()
        .in(accountIdColumn, accountIds)
        .select("id");

      if (deleteMembersByAccountError) {
        return NextResponse.json({ error: deleteMembersByAccountError.message }, { status: 500 });
      }
      removedAccountMembers += deletedMembersByAccount?.length || 0;
    }

    if (profileIdList.length > 0) {
      const { data: deletedOrgMembers, error: deleteOrgMemberError } = await service
        .from("organization_members")
        .delete()
        .eq("organization_id", organizationId)
        .eq("role", targetRole)
        .in("profile_id", profileIdList)
        .select("profile_id");

      if (deleteOrgMemberError) {
        return NextResponse.json({ error: deleteOrgMemberError.message }, { status: 500 });
      }
      removedOrgMembers = deletedOrgMembers?.length || 0;
    }

    if (accountIds.length > 0) {
      const { data: deletedAccounts, error: deleteAccountsError } = await service
        .from(accountTable)
        .delete()
        .in("id", accountIds)
        .select("id");

      if (deleteAccountsError) {
        return NextResponse.json({ error: deleteAccountsError.message }, { status: 500 });
      }
      removedAccounts = deletedAccounts?.length || 0;
    }

    // Company removal must not delete a shared login or profile. Permanent
    // account deletion is handled by the separate, explicitly authorized flow.

    await writeAuditLog(service, {
      actorProfileId: currentProfile.id,
      actorEmail: currentProfile.email || user.email || null,
      actorRole: currentProfile.role,
      organizationId,
      actionType: "admin.remove_team_member",
      targetType: targetRole,
      targetId: targetEmail,
      metadata: {
        email: targetEmail,
        role: targetRole,
        removedInvites,
        removedAccountMembers,
        removedAccounts,
        removedOrgMembers,
        deletedLogins,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${targetRole === "cleaner" ? "Cleaner" : "Grounds user"} removed from this company.`,
      summary: {
        removedInvites,
        removedAccountMembers,
        removedAccounts,
        removedOrgMembers,
        deletedLogins,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
