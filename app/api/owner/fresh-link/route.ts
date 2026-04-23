import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
}

function getOwnerWelcomeUrl(origin: string, ownerEmail: string) {
  const url = new URL("/owner/welcome", origin);
  url.searchParams.set("owner_email", ownerEmail);
  return url.toString();
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is missing from environment variables." },
        { status: 500 }
      );
    }

    if (!process.env.INVITE_FROM_EMAIL) {
      return NextResponse.json(
        { error: "INVITE_FROM_EMAIL is missing from environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const ownerEmail = String(body?.email || "").trim().toLowerCase();

    if (!ownerEmail) {
      return NextResponse.json({ error: "Owner email is required." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: owner, error: ownerError } = await serviceClient
      .from("owner_accounts")
      .select("id,email,full_name,is_active")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 500 });
    }

    if (!owner || owner.is_active === false) {
      return NextResponse.json(
        { error: "No active owner account was found for that email. Resend the owner invite from admin first." },
        { status: 404 }
      );
    }

    const ownerWelcomeUrl = getOwnerWelcomeUrl(request.nextUrl.origin, ownerEmail);

    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: {
        redirectTo: ownerWelcomeUrl,
        data: {
          role: "owner",
          owner_email: ownerEmail,
          owner_name: owner.full_name || null,
        },
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json(
        { error: linkError?.message || "Could not generate owner login link." },
        { status: 500 }
      );
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const ownerName = owner.full_name || "there";

    const result = await resend.emails.send({
      from: process.env.INVITE_FROM_EMAIL,
      to: ownerEmail,
      subject: "Your Estate of Mind owner portal login link",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #241c15;">
          <h2 style="margin: 0 0 12px;">Owner portal login</h2>
          <p>Hi ${ownerName},</p>
          <p>Use this fresh secure link to finish setting up your owner portal access.</p>
          <p style="margin: 24px 0;">
            <a href="${linkData.properties.action_link}" style="display:inline-block;padding:12px 18px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;">
              Open owner portal
            </a>
          </p>
          <p style="font-size:12px;color:#777;">
            If the button does not work, copy and paste this link into your browser:<br />
            <span style="word-break:break-all;">${linkData.properties.action_link}</span>
          </p>
        </div>
      `,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message || JSON.stringify(result.error) },
        { status: 500 }
      );
    }

    await serviceClient
      .from("owner_accounts")
      .update({ invite_sent_at: new Date().toISOString() })
      .eq("id", owner.id);

    return NextResponse.json({
      success: true,
      emailId: result.data?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
