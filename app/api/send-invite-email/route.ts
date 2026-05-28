import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type InviteEmailBody = {
  email?: string;
  inviteUrl?: string;
  role?: string;
  name?: string;
};

type TeamInviteRole = "cleaner" | "grounds";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

async function ensureAssignableTeamAccount(params: {
  service: any;
  organizationId: string;
  role: TeamInviteRole;
  email: string;
  name?: string | null;
  phone?: string | null;
}) {
  const accountTable = params.role === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
  const fallbackName = params.role === "cleaner" ? "Cleaner account" : "Grounds account";

  const { data: existingAccountData, error: existingAccountError } = await params.service
    .from(accountTable)
    .select("id, display_name, email")
    .eq("organization_id", params.organizationId)
    .eq("email", params.email)
    .limit(1)
    .maybeSingle();

  if (existingAccountError) {
    throw new Error(existingAccountError.message);
  }

  const existingAccount = existingAccountData as { id: string; display_name?: string | null } | null;
  const displayName = params.name?.trim() || existingAccount?.display_name || params.email || fallbackName;

  if (existingAccount) {
    const { error: updateError } = await params.service
      .from(accountTable)
      .update({
        display_name: displayName,
        email: params.email,
        phone: params.phone || null,
        active: true,
      })
      .eq("id", existingAccount.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return existingAccount.id;
  }

  const { data: insertedAccount, error: insertError } = await params.service
    .from(accountTable)
    .insert({
      organization_id: params.organizationId,
      display_name: displayName,
      email: params.email,
      phone: params.phone || null,
      active: true,
    })
    .select("id")
    .single();

  if (insertError || !insertedAccount) {
    throw new Error(insertError?.message || `Could not create ${params.role} account.`);
  }

  return insertedAccount.id;
}

export async function POST(req: Request) {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.INVITE_FROM_EMAIL;

    if (!resendApiKey || !fromEmail) {
      return NextResponse.json(
        { error: "Invite email service is not configured." },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Invite auth service is not configured." },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);

    if (!token) {
      return NextResponse.json({ error: "Missing admin session." }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as InviteEmailBody | null;
    const email = String(body?.email || "").trim().toLowerCase();
    const inviteUrl = String(body?.inviteUrl || "").trim();
    const role = String(body?.role || "").trim();
    const name = String(body?.name || "").trim();

    if (!email || !inviteUrl || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, inviteUrl, or role." },
        { status: 400 }
      );
    }

    let inviteToken = "";
    try {
      const parsedInviteUrl = new URL(inviteUrl);
      inviteToken = parsedInviteUrl.searchParams.get("token")?.trim() || "";
    } catch {
      return NextResponse.json({ error: "Invite URL is invalid." }, { status: 400 });
    }

    if (!inviteToken) {
      return NextResponse.json({ error: "Invite URL is missing its token." }, { status: 400 });
    }

    const authClient = createClient(supabaseUrl, publicSupabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Admin session is invalid." }, { status: 401 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      (profile.role !== "admin" && profile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: invite, error: inviteError } = await service
      .from("organization_invites")
      .select("id, organization_id, email, full_name, phone, role, status")
      .eq("token", inviteToken)
      .maybeSingle();

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    if (
      !invite ||
      invite.email?.toLowerCase() !== email ||
      invite.role !== role ||
      invite.status === "revoked" ||
      invite.status === "accepted"
    ) {
      return NextResponse.json({ error: "Invite could not be verified." }, { status: 403 });
    }

    if (profile.role !== "platform_admin") {
      const { data: membership, error: membershipError } = await service
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", invite.organization_id)
        .eq("profile_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (membershipError) {
        return NextResponse.json({ error: membershipError.message }, { status: 500 });
      }

      if (!membership) {
        return NextResponse.json(
          { error: "You cannot send invites for this organization." },
          { status: 403 }
        );
      }
    }

    let assignableAccountId: string | null = null;
    if (invite.role === "cleaner" || invite.role === "grounds") {
      assignableAccountId = await ensureAssignableTeamAccount({
        service,
        organizationId: invite.organization_id,
        role: invite.role,
        email,
        name: invite.full_name || name,
        phone: invite.phone || null,
      });
    }

    const resend = new Resend(resendApiKey);
    const subject = `You're invited to join GuleraOS as ${role}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
        <h2 style="margin: 0 0 12px;">You've been invited to GuleraOS</h2>
        <p>You've been invited to join as a <strong>${role}</strong>.</p>
        ${name ? `<p>Name on invite: <strong>${name}</strong></p>` : ""}
        <p>Click below to create your account:</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:10px;">
          Accept Invite
        </a>
        <p style="margin-top:20px; font-size:12px; color:#777;">
          If you were not expecting this, you can ignore this email.
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject,
      html,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || "Could not send invite email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: result.data?.id ?? null,
      assignableAccountId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error while sending invite email.",
      },
      { status: 500 }
    );
  }
}
