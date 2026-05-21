import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

type AdminInviteBody = {
  organizationId?: string;
  email?: string;
  fullName?: string;
  phone?: string;
};

function createInviteToken() {
  return `inv_${globalThis.crypto.randomUUID().replace(/-/g, "")}_${Date.now().toString(36)}`;
}

async function getRequestUser(token: string, supabaseUrl: string, anonKey: string) {
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
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated.");
  }

  return user;
}

async function sendAdminInviteEmail(params: {
  email: string;
  inviteUrl: string;
  name?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.INVITE_FROM_EMAIL;

  if (!resendApiKey || !fromEmail) {
    throw new Error("Invite email service is not configured.");
  }

  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: fromEmail,
    to: params.email,
    subject: "You're invited to join GuleraOS as company admin",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
        <h2 style="margin: 0 0 12px;">You've been invited to GuleraOS</h2>
        <p>You've been invited to join as a <strong>company admin</strong>.</p>
        ${params.name ? `<p>Name on invite: <strong>${params.name}</strong></p>` : ""}
        <p>Click below to create your account:</p>
        <a href="${params.inviteUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:10px;">
          Accept Invite
        </a>
        <p style="margin-top:20px; font-size:12px; color:#777;">
          Company admin access does not include platform or SaaS tower controls.
        </p>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || "Could not send invite email.");
  }

  return result.data?.id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: "Missing server environment variables." }, { status: 500 });
    }

    const user = await getRequestUser(accessToken, supabaseUrl, anonKey);
    const body = (await req.json().catch(() => null)) as AdminInviteBody | null;
    const organizationId = String(body?.organizationId || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const fullName = String(body?.fullName || "").trim() || null;
    const phone = String(body?.phone || "").trim() || null;

    if (!organizationId || !email) {
      return NextResponse.json({ error: "Missing organization or email." }, { status: 400 });
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

    if (currentProfile.role !== "platform_admin") {
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
          { error: "Only the primary admin can invite another admin." },
          { status: 403 }
        );
      }
    }

    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingInvite, error: existingInviteError } = await service
      .from("organization_invites")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("email", email)
      .eq("role", "admin")
      .in("status", ["pending", "sent"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInviteError) {
      return NextResponse.json({ error: existingInviteError.message }, { status: 500 });
    }

    const { data: invite, error: inviteError } = existingInvite
      ? await service
        .from("organization_invites")
        .update({
          full_name: fullName || existingInvite.full_name,
          phone: phone || existingInvite.phone,
          status: "sent",
          token,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .eq("id", existingInvite.id)
        .select()
        .single()
      : await service
        .from("organization_invites")
        .insert({
          organization_id: organizationId,
          email,
          full_name: fullName,
          phone,
          role: "admin",
          status: "sent",
          token,
          invited_by_profile_id: user.id,
          sent_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .select()
        .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: inviteError?.message || "Could not create admin invite." },
        { status: 500 }
      );
    }

    const inviteUrl = `${new URL(req.url).origin}/invite?token=${invite.token}`;
    const emailId = await sendAdminInviteEmail({
      email,
      inviteUrl,
      name: fullName,
    });

    return NextResponse.json({
      invite,
      inviteUrl,
      emailId,
      refreshed: !!existingInvite,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}
