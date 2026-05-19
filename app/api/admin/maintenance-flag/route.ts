import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSender(email: string, name?: string | null) {
  const cleanName = String(name || "Property management").replace(/[<>"]/g, "").trim();
  return cleanName ? `${cleanName} <${email}>` : email;
}

function missingEnvironmentResponse() {
  return NextResponse.json(
    { error: "Missing Supabase server environment variables." },
    { status: 500 }
  );
}

async function requireAdmin(request: NextRequest, organizationId: string) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return { response: missingEnvironmentResponse() };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return { response: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { response: NextResponse.json({ error: profileError.message }, { status: 500 }) };
  }

  if (!profile || (profile.role !== "admin" && profile.role !== "platform_admin")) {
    return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError) {
      return { response: NextResponse.json({ error: membershipError.message }, { status: 500 }) };
    }

    if (!membership) {
      return {
        response: NextResponse.json(
          { error: "Admin access required for this organization." },
          { status: 403 }
        ),
      };
    }
  }

  return { user, serviceClient };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const category = String(body?.category || "").trim();
    const urgency = String(body?.urgency || "normal").trim() || "normal";
    const notes = String(body?.notes || "").trim();

    if (!organizationId || !propertyId || !category || !notes) {
      return NextResponse.json({ error: "Missing required maintenance flag details." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    const { data: property, error: propertyError } = await admin.serviceClient
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    if (!property) {
      return NextResponse.json({ error: "Property not found for this organization." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const { data: flag, error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .insert({
        organization_id: organizationId,
        property_id: propertyId,
        source: "admin",
        category,
        urgency,
        status: "open",
        notes,
        flagged_by_profile_id: admin.user.id,
        flagged_at: nowIso,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, flag });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create maintenance flag." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const flagId = String(body?.flagId || "").trim();
    const action = String(body?.action || "resolve").trim();

    if (!organizationId || !flagId) {
      return NextResponse.json({ error: "Missing maintenance flag." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    if (action === "update") {
      const category = String(body?.category || "").trim();
      const urgency = String(body?.urgency || "normal").trim() || "normal";
      const notes = String(body?.notes || "").trim();

      if (!category || !notes) {
        return NextResponse.json({ error: "Category and notes are required." }, { status: 400 });
      }

      const { data: flag, error } = await admin.serviceClient
        .from("property_maintenance_flags")
        .update({
          category,
          urgency,
          notes,
        })
        .eq("id", flagId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, flag });
    }

    if (action === "notify_owner") {
      const resendApiKey = process.env.RESEND_API_KEY;
      const fallbackFromEmail = process.env.INVITE_FROM_EMAIL || "";

      if (!resendApiKey) {
        return NextResponse.json({ error: "Resend API key is not configured." }, { status: 500 });
      }

      const { data: flag, error: flagError } = await admin.serviceClient
        .from("property_maintenance_flags")
        .select("*")
        .eq("id", flagId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (flagError) {
        return NextResponse.json({ error: flagError.message }, { status: 500 });
      }

      if (!flag) {
        return NextResponse.json({ error: "Maintenance flag not found." }, { status: 404 });
      }

      const { data: property, error: propertyError } = await admin.serviceClient
        .from("properties")
        .select("id,name,address")
        .eq("id", flag.property_id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (propertyError) {
        return NextResponse.json({ error: propertyError.message }, { status: 500 });
      }

      const { data: ownerAccessRows, error: accessError } = await admin.serviceClient
        .from("owner_property_access")
        .select("owner_account_id")
        .eq("property_id", flag.property_id);

      if (accessError) {
        return NextResponse.json({ error: accessError.message }, { status: 500 });
      }

      const ownerIds = [...new Set((ownerAccessRows || []).map((row: any) => row.owner_account_id).filter(Boolean))];
      if (ownerIds.length === 0) {
        return NextResponse.json({ error: "No linked owner was found for this property." }, { status: 404 });
      }

      const { data: owners, error: ownersError } = await admin.serviceClient
        .from("owner_accounts")
        .select("id,email,full_name")
        .in("id", ownerIds);

      if (ownersError) {
        return NextResponse.json({ error: ownersError.message }, { status: 500 });
      }

      const recipients = (owners || [])
        .map((owner: any) => String(owner.email || "").trim().toLowerCase())
        .filter(Boolean);

      if (recipients.length === 0) {
        return NextResponse.json({ error: "Linked owner does not have an email address." }, { status: 400 });
      }

      const { data: settings } = await admin.serviceClient
        .from("organization_invoice_settings")
        .select("company_name,from_email,reply_to_email")
        .eq("organization_id", organizationId)
        .maybeSingle();

      const fromEmail = String(settings?.from_email || fallbackFromEmail || "").trim();
      if (!fromEmail) {
        return NextResponse.json({ error: "Sender email is not configured." }, { status: 500 });
      }

      const propertyLabel = property?.name || property?.address || "your property";
      const ownerPortalUrl = `${request.nextUrl.origin}/owner`;
      const html = `
        <div style="font-family:Arial,sans-serif;color:#241c15;line-height:1.5;padding:20px;">
          <h1 style="margin:0 0 8px;font-size:24px;">Maintenance update</h1>
          <p style="margin:0 0 18px;color:#6f6255;">${escapeHtml(propertyLabel)}</p>
          <div style="margin-bottom:18px;padding:14px;border:1px solid #eadfce;border-radius:14px;background:#fcfaf7;">
            <div><strong>Category:</strong> ${escapeHtml(flag.category || "Maintenance")}</div>
            <div><strong>Urgency:</strong> ${escapeHtml(flag.urgency || "normal")}</div>
            <div><strong>Status:</strong> ${escapeHtml(flag.status || "open")}</div>
          </div>
          <p style="white-space:pre-wrap;margin:0 0 18px;">${escapeHtml(flag.notes || "A maintenance item has been opened for this property.")}</p>
          <a href="${escapeHtml(ownerPortalUrl)}" style="display:inline-block;padding:10px 16px;background:#241c15;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:700;">
            Open owner portal
          </a>
        </div>
      `;

      const resend = new Resend(resendApiKey);
      const result = await resend.emails.send({
        from: formatSender(fromEmail, settings?.company_name),
        to: recipients,
        replyTo: settings?.reply_to_email || undefined,
        subject: `Maintenance update for ${propertyLabel}`,
        html,
      });

      if (result.error) {
        return NextResponse.json({ error: result.error.message || "Owner notification failed." }, { status: 500 });
      }

      const nowIso = new Date().toISOString();
      const { data: updatedFlag, error: updateError } = await admin.serviceClient
        .from("property_maintenance_flags")
        .update({
          owner_visible_at: flag.owner_visible_at || nowIso,
          owner_notified_at: nowIso,
          owner_notified_by_profile_id: admin.user.id,
        })
        .eq("id", flagId)
        .eq("organization_id", organizationId)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, flag: updatedFlag, notified: recipients.length });
    }

    const { data: flag, error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by_profile_id: admin.user.id,
      })
      .eq("id", flagId)
      .eq("organization_id", organizationId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, flag });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve maintenance flag." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const flagIds = Array.isArray(body?.flagIds)
      ? body.flagIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : [];

    if (!organizationId || flagIds.length === 0) {
      return NextResponse.json({ error: "Missing maintenance flags." }, { status: 400 });
    }

    const admin = await requireAdmin(request, organizationId);
    if ("response" in admin) return admin.response;

    const { error: imageError } = await admin.serviceClient
      .from("property_maintenance_flag_images")
      .delete()
      .in("flag_id", flagIds);

    if (imageError) {
      return NextResponse.json({ error: imageError.message }, { status: 500 });
    }

    const { error } = await admin.serviceClient
      .from("property_maintenance_flags")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", flagIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deletedIds: flagIds });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete maintenance flags." },
      { status: 500 }
    );
  }
}
