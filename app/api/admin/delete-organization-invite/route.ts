import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/server/audit-log";

async function countRows(service: any, table: string, column: string, value: string) {
  const { count, error } = await service
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  if (error) throw error;
  return count || 0;
}

async function cleanupUnlinkedInviteLogin(service: any, email: string, role: string) {
  if (role !== "cleaner" && role !== "grounds") {
    return { deletedLoginIds: [] as string[], skippedProfileIds: [] as string[] };
  }

  const { data: profiles, error: profileError } = await service
    .from("profiles")
    .select("id, role, email")
    .ilike("email", email);

  if (profileError) throw profileError;

  const deletedLoginIds: string[] = [];
  const skippedProfileIds: string[] = [];

  for (const profile of profiles || []) {
    const profileId = profile?.id as string | undefined;
    const profileRole = String(profile?.role || "");
    if (!profileId || (profileRole !== role && profileRole !== "pending")) {
      skippedProfileIds.push(profileId || "unknown");
      continue;
    }

    const [orgMemberships, cleanerMemberships, groundsMemberships, ownerAccounts] =
      await Promise.all([
        countRows(service, "organization_members", "profile_id", profileId),
        countRows(service, "cleaner_account_members", "profile_id", profileId),
        countRows(service, "grounds_account_members", "profile_id", profileId),
        countRows(service, "owner_accounts", "profile_id", profileId),
      ]);

    if (orgMemberships + cleanerMemberships + groundsMemberships + ownerAccounts > 0) {
      skippedProfileIds.push(profileId);
      continue;
    }

    const { error: deleteProfileError } = await service
      .from("profiles")
      .delete()
      .eq("id", profileId);

    if (deleteProfileError) throw deleteProfileError;

    const { error: deleteAuthError } = await service.auth.admin.deleteUser(profileId);
    if (deleteAuthError) throw deleteAuthError;

    deletedLoginIds.push(profileId);
  }

  return { deletedLoginIds, skippedProfileIds };
}

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
    const inviteId = body?.inviteId as string | undefined;
    const organizationId = body?.organizationId as string | undefined;

    if (!inviteId || !organizationId) {
      return NextResponse.json(
        { error: "Missing inviteId or organizationId." },
        { status: 400 }
      );
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

    if (!membership) {
      return NextResponse.json(
        { error: "You do not have access to this organization." },
        { status: 403 }
      );
    }

    const { data: targetInvite, error: targetInviteError } = await service
      .from("organization_invites")
      .select("id, role")
      .eq("id", inviteId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (targetInviteError) {
      return NextResponse.json({ error: targetInviteError.message }, { status: 500 });
    }

    if (!targetInvite) {
      return NextResponse.json(
        { error: "No pending invite was found to revoke." },
        { status: 404 }
      );
    }

    if (targetInvite.role === "admin" && currentProfile.role !== "platform_admin") {
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
          { error: "Only the primary admin can revoke admin invites." },
          { status: 403 }
        );
      }
    }

    const { data: revokedInvite, error: revokeError } = await service
      .from("organization_invites")
      .update({ status: "revoked" })
      .eq("id", inviteId)
      .eq("organization_id", organizationId)
      .in("status", ["pending", "sent"])
      .select("id, email, role")
      .maybeSingle();

    if (revokeError) {
      return NextResponse.json({ error: revokeError.message }, { status: 500 });
    }

    if (!revokedInvite) {
      return NextResponse.json(
        { error: "No pending invite was found to revoke." },
        { status: 404 }
      );
    }

    let cleanupSummary = {
      deletedLoginIds: [] as string[],
      skippedProfileIds: [] as string[],
    };

    try {
      cleanupSummary = await cleanupUnlinkedInviteLogin(
        service,
        String(revokedInvite.email || "").trim().toLowerCase(),
        String(revokedInvite.role || "")
      );
    } catch (cleanupError) {
      console.error("[admin/delete-organization-invite] invite login cleanup failed", {
        inviteId,
        message: cleanupError instanceof Error ? cleanupError.message : cleanupError,
      });
    }

    await writeAuditLog(service, {
      actorProfileId: currentProfile.id,
      actorEmail: currentProfile.email || user.email || null,
      actorRole: currentProfile.role,
      organizationId,
      actionType: "admin.delete_invite",
      targetType: "organization_invite",
      targetId: inviteId,
      metadata: {
        status: "revoked_pending_invite",
        email: revokedInvite.email,
        role: revokedInvite.role,
        deleted_unlinked_logins: cleanupSummary.deletedLoginIds.length,
        skipped_profiles: cleanupSummary.skippedProfileIds.length,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        cleanupSummary.deletedLoginIds.length > 0
          ? "Pending invite revoked and unlinked pending login cleared."
          : "Pending invite revoked.",
      cleanup: cleanupSummary,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
