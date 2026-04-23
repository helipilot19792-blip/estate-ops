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

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const inviteToken = typeof body?.token === "string" ? body.token.trim() : "";

    if (!inviteToken) {
      return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
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

    const { data: invite, error: inviteError } = await service
      .from("organization_invites")
      .select("*")
      .eq("token", inviteToken)
      .maybeSingle<InviteRow>();

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    if (!invite) {
      return NextResponse.json(
        { error: "This invite link is invalid or no longer exists." },
        { status: 404 }
      );
    }

    if (invite.status === "revoked") {
      return NextResponse.json({ error: "This invite has been revoked." }, { status: 400 });
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This invite has expired." }, { status: 400 });
    }

    const userEmail = user.email?.trim().toLowerCase() || "";
    const inviteEmail = invite.email.trim().toLowerCase();

    if (!userEmail || userEmail !== inviteEmail) {
      return NextResponse.json(
        { error: "You are signed in with a different email than the invite." },
        { status: 403 }
      );
    }

    const { data: existingOrgMembership, error: membershipLookupError } = await service
      .from("organization_members")
      .select("organization_id, profile_id")
      .eq("organization_id", invite.organization_id)
      .eq("profile_id", user.id)
      .maybeSingle();

    if (membershipLookupError) {
      return NextResponse.json({ error: membershipLookupError.message }, { status: 500 });
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
        return NextResponse.json({ error: insertMembershipError.message }, { status: 500 });
      }
    }

    const profileUpdates: Record<string, string | null> = {
      role: invite.role,
    };

    if (invite.phone) {
      profileUpdates.phone = invite.phone;
    }

    if (invite.full_name) {
      profileUpdates.full_name = invite.full_name;
    }

    const { error: profileUpdateError } = await service
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user.id);

    if (profileUpdateError) {
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    if (invite.role === "cleaner") {
      const { data: existingMembership, error: cleanerMembershipError } = await service
        .from("cleaner_account_members")
        .select("id, cleaner_account_id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();

      if (cleanerMembershipError) {
        return NextResponse.json({ error: cleanerMembershipError.message }, { status: 500 });
      }

      if (!existingMembership) {
        const { data: existingAccount, error: existingAccountError } = await service
          .from("cleaner_accounts")
          .select("id")
          .eq("organization_id", invite.organization_id)
          .eq("email", invite.email)
          .limit(1)
          .maybeSingle();

        if (existingAccountError) {
          return NextResponse.json({ error: existingAccountError.message }, { status: 500 });
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
            return NextResponse.json(
              { error: insertAccountError?.message || "Could not create cleaner account." },
              { status: 500 }
            );
          }

          cleanerAccountId = insertedAccount.id;
        }

        const { error: memberInsertError } = await service
          .from("cleaner_account_members")
          .insert({
            cleaner_account_id: cleanerAccountId,
            profile_id: user.id,
          });

        if (memberInsertError) {
          return NextResponse.json({ error: memberInsertError.message }, { status: 500 });
        }
      }
    }

    if (invite.role === "grounds") {
      const { data: existingMembership, error: groundsMembershipError } = await service
        .from("grounds_account_members")
        .select("id, grounds_account_id")
        .eq("profile_id", user.id)
        .limit(1)
        .maybeSingle();

      if (groundsMembershipError) {
        return NextResponse.json({ error: groundsMembershipError.message }, { status: 500 });
      }

      if (!existingMembership) {
        const { data: existingAccount, error: existingAccountError } = await service
          .from("grounds_accounts")
          .select("id")
          .eq("organization_id", invite.organization_id)
          .eq("email", invite.email)
          .limit(1)
          .maybeSingle();

        if (existingAccountError) {
          return NextResponse.json({ error: existingAccountError.message }, { status: 500 });
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
            return NextResponse.json(
              { error: insertAccountError?.message || "Could not create grounds account." },
              { status: 500 }
            );
          }

          groundsAccountId = insertedAccount.id;
        }

        const { error: memberInsertError } = await service
          .from("grounds_account_members")
          .insert({
            grounds_account_id: groundsAccountId,
            profile_id: user.id,
          });

        if (memberInsertError) {
          return NextResponse.json({ error: memberInsertError.message }, { status: 500 });
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
      return NextResponse.json({ error: inviteUpdateError.message }, { status: 500 });
    }

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
