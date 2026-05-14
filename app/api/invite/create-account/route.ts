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
    console.error("[invite/create-account]", message, details || "");
  } else {
    console.warn("[invite/create-account]", message, details || "");
  }

  return NextResponse.json({ error: message }, { status });
}

async function findAuthUserByEmail(service: any, email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw new Error(error.message);

    const user = (data?.users ?? []).find(
      (candidate: any) => candidate.email?.trim().toLowerCase() === normalizedEmail
    );

    if (user) return user;
    if (!data?.users || data.users.length < 1000) return null;
  }

  return null;
}

async function upsertInviteLinks(service: any, invite: InviteRow, userId: string) {
  const profilePayload: Record<string, string | null> = {
    id: userId,
    email: invite.email,
    role: invite.role,
    phone: invite.phone ?? null,
    full_name: invite.full_name?.trim() || null,
  };

  const { error: profileUpsertError } = await service
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileUpsertError) throw new Error(profileUpsertError.message);

  const { data: existingOrgMembership, error: membershipLookupError } = await service
    .from("organization_members")
    .select("organization_id, profile_id, role")
    .eq("organization_id", invite.organization_id)
    .eq("profile_id", userId)
    .maybeSingle();

  if (membershipLookupError) throw new Error(membershipLookupError.message);

  if (!existingOrgMembership) {
    const { error: insertMembershipError } = await service
      .from("organization_members")
      .insert({
        organization_id: invite.organization_id,
        profile_id: userId,
        role: invite.role,
      });

    if (insertMembershipError) throw new Error(insertMembershipError.message);
  } else if (existingOrgMembership.role !== invite.role) {
    const { error: updateMembershipError } = await service
      .from("organization_members")
      .update({ role: invite.role })
      .eq("organization_id", invite.organization_id)
      .eq("profile_id", userId);

    if (updateMembershipError) throw new Error(updateMembershipError.message);
  }

  if (invite.role === "cleaner") {
    const { data: existingAccount, error: existingAccountError } = await service
      .from("cleaner_accounts")
      .select("id")
      .eq("organization_id", invite.organization_id)
      .eq("email", invite.email)
      .limit(1)
      .maybeSingle();

    if (existingAccountError) throw new Error(existingAccountError.message);

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
        throw new Error(insertAccountError?.message || "Could not create cleaner account.");
      }

      cleanerAccountId = insertedAccount.id;
    }

    const { data: existingMembership, error: cleanerMembershipError } = await service
      .from("cleaner_account_members")
      .select("id")
      .eq("profile_id", userId)
      .eq("cleaner_account_id", cleanerAccountId)
      .limit(1)
      .maybeSingle();

    if (cleanerMembershipError) throw new Error(cleanerMembershipError.message);

    if (!existingMembership) {
      const { error: memberInsertError } = await service
        .from("cleaner_account_members")
        .insert({
          cleaner_account_id: cleanerAccountId,
          profile_id: userId,
        });

      if (memberInsertError) throw new Error(memberInsertError.message);
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

    if (existingAccountError) throw new Error(existingAccountError.message);

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
        throw new Error(insertAccountError?.message || "Could not create grounds account.");
      }

      groundsAccountId = insertedAccount.id;
    }

    const { data: existingMembership, error: groundsMembershipError } = await service
      .from("grounds_account_members")
      .select("id")
      .eq("profile_id", userId)
      .eq("grounds_account_id", groundsAccountId)
      .limit(1)
      .maybeSingle();

    if (groundsMembershipError) throw new Error(groundsMembershipError.message);

    if (!existingMembership) {
      const { error: memberInsertError } = await service
        .from("grounds_account_members")
        .insert({
          grounds_account_id: groundsAccountId,
          profile_id: userId,
        });

      if (memberInsertError) throw new Error(memberInsertError.message);
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

  if (inviteUpdateError) throw new Error(inviteUpdateError.message);

  return {
    ...invite,
    accepted_at: acceptedAt,
    status: "accepted",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const inviteToken = typeof body?.token === "string" ? body.token.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!inviteToken) {
      return jsonError("Missing invite token.", 400);
    }

    if (!password) {
      return jsonError("Password is required.", 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonError("Missing server environment variables.", 500);
    }

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

    if (invite.role === "owner") {
      return jsonError("Owner invites use the owner welcome link. Please use the newest owner invite email.", 400);
    }

    const email = invite.email.trim().toLowerCase();
    const existingUser = await findAuthUserByEmail(service, email);
    const userMetadata = {
      full_name: invite.full_name?.trim() || null,
      phone: invite.phone ?? null,
      invite_token: inviteToken,
      invite_role: invite.role,
      organization_id: invite.organization_id,
    };

    let userId = existingUser?.id || "";
    const accountAlreadyExisted = !!existingUser;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: userMetadata,
      } as any);

      if (createUserError || !createdUser?.user) {
        return jsonError(createUserError?.message || "Could not create invited account.", 500, {
          inviteId: invite.id,
        });
      }

      userId = createdUser.user.id;
    }

    const acceptedInvite = await upsertInviteLinks(service, invite, userId);

    return NextResponse.json({
      ok: true,
      invite: acceptedInvite,
      email,
      accountAlreadyExisted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}

export {};
