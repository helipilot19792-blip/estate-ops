import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    // 🔍 DEBUG: check environment
    console.error("=== SEND INVITE EMAIL DEBUG ===");
    console.error("CWD:", process.cwd());
    console.error("Has RESEND_API_KEY?", !!process.env.RESEND_API_KEY);
    console.error("Has INVITE_FROM_EMAIL?", !!process.env.INVITE_FROM_EMAIL);

    if (!process.env.RESEND_API_KEY) {
      console.error("❌ RESEND_API_KEY missing");
      return NextResponse.json(
        { error: "RESEND_API_KEY is missing from environment variables." },
        { status: 500 }
      );
    }

    if (!process.env.INVITE_FROM_EMAIL) {
      console.error("❌ INVITE_FROM_EMAIL missing");
      return NextResponse.json(
        { error: "INVITE_FROM_EMAIL is missing from environment variables." },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    const body = await req.json();
    const { email, inviteUrl, role, name } = body ?? {};

    console.error("📨 Sending invite to:", email);

    if (!email || !inviteUrl || !role) {
      return NextResponse.json(
        { error: "Missing required fields: email, inviteUrl, or role." },
        { status: 400 }
      );
    }

    const subject = `You're invited to join Gulera OS as ${role}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>You’ve been invited to Gulera OS</h2>
        <p>You’ve been invited to join as a <strong>${role}</strong>.</p>
        ${name ? `<p>Name on invite: <strong>${name}</strong></p>` : ""}
        <p>Click below to create your account:</p>
        <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;margin-top:10px;">
          Accept Invite
        </a>
        <p style="margin-top:20px; font-size:12px; color:#777;">
          If you weren’t expecting this, you can ignore this email.
        </p>
      </div>
    `;

    const result = await resend.emails.send({
      from: process.env.INVITE_FROM_EMAIL!,
      to: email,
      subject,
      html,
    });

    if (result.error) {
      console.error("❌ Resend send error:", result.error);
      return NextResponse.json(
        { error: result.error.message || JSON.stringify(result.error) },
        { status: 500 }
      );
    }

    console.error("✅ Email sent:", result.data?.id);

    return NextResponse.json({
      success: true,
      id: result.data?.id ?? null,
    });
  } catch (err: any) {
    console.error("❌ send-invite-email route failed:", err);
    return NextResponse.json(
      { error: err?.message || "Unknown error while sending invite email." },
      { status: 500 }
    );
  }
}