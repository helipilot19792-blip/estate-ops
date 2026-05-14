import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type InviteRow = {
  id: string;
  organization_id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: "cleaner" | "grounds" | "owner" | "admin";
  status: string | null;
  expires_at: string | null;
};

function jsonError(message: string, status: number, details?: unknown) {
  if (status >= 500) {
    console.error("[invite/accept]", message, details || "");
  } else {
    console.warn("[invite/accept]", message, details || "");
  }

  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return jsonError("Missing access token.", 401);
    }

    const body = await req.json().catch(() => null);
    const inviteToken = typeof body?.token === "string" ? body.token.trim() : "";

    if (!inviteToken) {
      return jsonError("Missing invite token.", 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonError("Missing server environment variables.", 500);
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
      return jsonError("Not authenticated.", 401, userError);
    }

    console.info("[invite/accept] accepting invite", {
      userId: user.id,
      email: user.email,
      tokenSuffix: inviteToken.slice(-8),
    });

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invite, error: inviteError } = await service
      .from("organization_invites")
      .select("*")
      .eq("token", inviteToken)
      .maybeSingle<InviteRow>();

    if (inviteError) {
      return jsonError(inviteError.message, 500);
    }

    if (!invite) {
      return jsonError("This invite link is invalid or no longer exists.", 404);
    }

    if (invite.status === "revoked") {
      return jsonError("This invite has been revoked.", 400, { inviteId: invite.id });
    }

    if (invite.status === "expired") {
      return jsonError("This invite has expired.", 400, { inviteId: invite.id });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return jsonError("This invite has expired.", 400, { inviteId: invite.id });
    }

    const userEmail = user.email?.trim().toLowerCase() || "";
    const inviteEmail = invite.email.trim().toLowerCase();

    if (!userEmail || userEmail !== inviteEmail) {
      return jsonError("You are signed in with a different email than the invite.", 403, {
        inviteId: invite.id,
        userEmail,
        inviteEmail,
      });
    }

    const profilePayload: Record<string, string | null> = {
      id: user.id,
      email: user.email || invite.email,
      role: invite.role,
      phone: invite.phone ?? null,
      full_name:
        invite.full_name?.trim() ||
        (typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.trim()
          : "") ||
        null,
    };

    const { error: profileUpsertError } = await service
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (profileUpsertError) {
      return jsonError(profileUpsertError.message, 500, {
        inviteId: invite.id,
        userId: user.id,
      });
    }

    const { data: existingOrgMembership, error: membershipLookupError } = await service
      .from("organization_members")
      .select("organization_id, profile_id, role")
      .eq("organization_id", invite.organization_id)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipLookupError) {
      return jsonError(membershipLookupError.message, 500, {
        inviteId: invite.id,
        userId: user.id,
      });
    }

    if (!existingOrgMembership) {
      const { error: insertMembershipError } = await service
        .from("organization_members")
        .insert({
          organization_id: invite.organization_id,
          profile_id: user.id,
          role: invite.role,
        });

      if (insertMembershipError) {
        return jsonError(insertMembershipError.message, 500, {
          inviteId: invite.id,
          userId: user.id,
        });
      }
    } else if (existingOrgMembership && existingOrgMembership.role !== invite.role) {
      const { error: updateMembershipError } = await service
        .from("organization_members")
        .update({ role: invite.role })
        .eq("organization_id", invite.organization_id)
        .eq("profile_id", user.id);

      if (updateMembershipError) {
        return jsonError(updateMembershipError.message, 500, {
          inviteId: invite.id,
          userId: user.id,
        });
      }
    }

    if (invite.role === "cleaner") {
      const { data: existingAccount, error: existingAccountError } = await service
        .from("cleaner_accounts")
        .select("id")
        .eq("organization_id", invite.organization_id)
        .eq("email", invite.email)
        .limit(1)
        .maybeSingle();

      if (existingAccountError) {
        return jsonError(existingAccountError.message, 500, { inviteId: invite.id });
      }

      let cleanerAccountId = existingAccount?.id || null;

      if (!cleanerAccountId) {
        const { data: insertedAccount, error: insertAccountError } = await service
          .from("cleaner_accounts")
          .insert({
            organization_id: invite.organization_id,
            display_name: invite.full_name?.trim() || invite.email || "Cleaner account",
            email: invite.email,
            phone: invite.phone ?? null,
            active: true,
          })
          .select("id")
          .single();

        if (insertAccountError || !insertedAccount) {
          return jsonError(insertAccountError?.message || "Could not create cleaner account.", 500, {
            inviteId: invite.id,
          });
        }

        cleanerAccountId = insertedAccount.id;
      }

      const { data: existingMembership, error: cleanerMembershipError } = await service
        .from("cleaner_account_members")
        .select("id, cleaner_account_id")
        .eq("profile_id", user.id)
        .eq("cleaner_account_id", cleanerAccountId)
        .limit(1)
        .maybeSingle();

      if (cleanerMembershipError) {
        return jsonError(cleanerMembershipError.message, 500, {
          inviteId: invite.id,
          userId: user.id,
          cleanerAccountId,
        });
      }

      if (!existingMembership) {
        const { error: memberInsertError } = await service
          .from("cleaner_account_members")
          .insert({
            cleaner_account_id: cleanerAccountId,
            profile_id: user.id,
          });

        if (memberInsertError) {
          return jsonError(memberInsertError.message, 500, {
            inviteId: invite.id,
            userId: user.id,
            cleanerAccountId,
          });
        }
      }
    }

    if (invite.role === "grounds") {
      const { data: existingAccount, error: existingAccountError } = await service
        .from("grounds_accounts")
        .select("id")
        .eq("organization_id", invite.organization_id)
        .eq("email", invite.email)
        .limit(1)
        .maybeSingle();

      if (existingAccountError) {
        return jsonError(existingAccountError.message, 500, { inviteId: invite.id });
      }

      let groundsAccountId = existingAccount?.id || null;

      if (!groundsAccountId) {
        const { data: insertedAccount, error: insertAccountError } = await service
          .from("grounds_accounts")
          .insert({
            organization_id: invite.organization_id,
            display_name: invite.full_name?.trim() || invite.email || "Grounds account",
            email: invite.email,
            phone: invite.phone ?? null,
            active: true,
          })
          .select("id")
          .single();

        if (insertAccountError || !insertedAccount) {
          return jsonError(insertAccountError?.message || "Could not create grounds account.", 500, {
            inviteId: invite.id,
          });
        }

        groundsAccountId = insertedAccount.id;
      }

      const { data: existingMembership, error: groundsMembershipError } = await service
        .from("grounds_account_members")
        .select("id, grounds_account_id")
        .eq("profile_id", user.id)
        .eq("grounds_account_id", groundsAccountId)
        .limit(1)
        .maybeSingle();

      if (groundsMembershipError) {
        return jsonError(groundsMembershipError.message, 500, {
          inviteId: invite.id,
          userId: user.id,
          groundsAccountId,
        });
      }

      if (!existingMembership) {
        const { error: memberInsertError } = await service
          .from("grounds_account_members")
          .insert({
            grounds_account_id: groundsAccountId,
            profile_id: user.id,
          });

        if (memberInsertError) {
          return jsonError(memberInsertError.message, 500, {
            inviteId: invite.id,
            userId: user.id,
            groundsAccountId,
          });
        }
      }
    }

    const acceptedAt = new Date().toISOString();
    const { error: inviteUpdateError } = await service
      .from("organization_invites")
      .update({
        accepted_at: acceptedAt,
        status: "accepted",
      })
      .eq("id", invite.id);

    if (inviteUpdateError) {
      return jsonError(inviteUpdateError.message, 500, {
        inviteId: invite.id,
        userId: user.id,
      });
    }

    console.info("[invite/accept] invite accepted", {
      inviteId: invite.id,
      userId: user.id,
      organizationId: invite.organization_id,
      role: invite.role,
    });

    return NextResponse.json({
      invite: {
        ...invite,
        accepted_at: acceptedAt,
        status: "accepted",
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
