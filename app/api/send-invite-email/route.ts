import { NextResponse } from "next/server";
import { Resend } from "resend";

type InviteEmailBody = {
  email?: string;
  inviteUrl?: string;
  role?: string;
  name?: string;
};

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
