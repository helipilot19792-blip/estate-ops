import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function missingEnvironmentResponse() {
  return NextResponse.json(
    { error: "Missing Supabase server environment variables." },
    { status: 500 }
  );
}

function createAuthClient(token: string) {
  return createClient(supabaseUrl!, publicSupabaseKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function createServiceClient() {
  return createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireStaff(
  request: NextRequest,
  source: "cleaner" | "grounds",
  propertyId: string
) {
  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    return { response: missingEnvironmentResponse() };
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return { response: NextResponse.json({ error: "Missing auth token." }, { status: 401 }) };
  }

  const authClient = createAuthClient(token);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const serviceClient = createServiceClient();

  const { data: property, error: propertyError } = await serviceClient
    .from("properties")
    .select("id, organization_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    return { response: NextResponse.json({ error: propertyError.message }, { status: 500 }) };
  }

  if (!property?.organization_id) {
    return { response: NextResponse.json({ error: "Property not found." }, { status: 404 }) };
  }

  const accountTable = source === "cleaner" ? "cleaner_accounts" : "grounds_accounts";
  const memberTable = source === "cleaner" ? "cleaner_account_members" : "grounds_account_members";
  const accountIdColumn = source === "cleaner" ? "cleaner_account_id" : "grounds_account_id";

  const { data: memberships, error: membershipError } = await serviceClient
    .from(memberTable)
    .select(`id, ${accountIdColumn}`)
    .eq("profile_id", user.id);

  if (membershipError) {
    return { response: NextResponse.json({ error: membershipError.message }, { status: 500 }) };
  }

  const accountIds = (memberships || [])
    .map((membership) => String(membership[accountIdColumn as keyof typeof membership] || "").trim())
    .filter(Boolean);

  if (accountIds.length === 0) {
    return {
      response: NextResponse.json(
        { error: `No ${source} account is linked to this sign-in.` },
        { status: 403 }
      ),
    };
  }

  const { data: accounts, error: accountsError } = await serviceClient
    .from(accountTable)
    .select("id, organization_id, active")
    .in("id", accountIds);

  if (accountsError) {
    return { response: NextResponse.json({ error: accountsError.message }, { status: 500 }) };
  }

  const allowedAccount = (accounts || []).find(
    (account) =>
      account.organization_id === property.organization_id &&
      account.active !== false
  );

  if (!allowedAccount) {
    return {
      response: NextResponse.json(
        { error: `This ${source} account cannot report issues for that property.` },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    property,
    serviceClient,
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const propertyId = String(formData.get("propertyId") || "").trim();
    const sourceValue = String(formData.get("source") || "").trim().toLowerCase();
    const category = String(formData.get("category") || "").trim();
    const urgency = String(formData.get("urgency") || "normal").trim() || "normal";
    const notes = String(formData.get("notes") || "").trim();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!propertyId || !category || !notes) {
      return NextResponse.json({ error: "Missing required maintenance flag details." }, { status: 400 });
    }

    if (sourceValue !== "cleaner" && sourceValue !== "grounds") {
      return NextResponse.json({ error: "Invalid issue source." }, { status: 400 });
    }

    const access = await requireStaff(request, sourceValue, propertyId);
    if ("response" in access) return access.response;

    const nowIso = new Date().toISOString();
    const { data: flag, error: insertError } = await access.serviceClient
      .from("property_maintenance_flags")
      .insert({
        organization_id: access.property.organization_id,
        property_id: propertyId,
        source: sourceValue,
        category,
        urgency,
        status: "open",
        notes,
        flagged_by_profile_id: access.user.id,
        flagged_at: nowIso,
      })
      .select("*")
      .single();

    if (insertError || !flag) {
      return NextResponse.json(
        { error: insertError?.message || "Could not create maintenance flag." },
        { status: 500 }
      );
    }

    if (files.length > 0) {
      const uploads: Array<{
        flag_id: string;
        image_url: string;
        sort_order: number;
      }> = [];

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `${flag.id}/${Date.now()}-${index}-${safeName}`;
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await access.serviceClient.storage
          .from("maintenance-flag-images")
          .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadError) {
          console.error(uploadError);
          continue;
        }

        const { data } = access.serviceClient.storage
          .from("maintenance-flag-images")
          .getPublicUrl(filePath);

        uploads.push({
          flag_id: flag.id,
          image_url: data.publicUrl,
          sort_order: index,
        });
      }

      if (uploads.length > 0) {
        const { error: imageInsertError } = await access.serviceClient
          .from("property_maintenance_flag_images")
          .insert(uploads);

        if (imageInsertError) {
          console.error(imageInsertError);
        }
      }
    }

    return NextResponse.json({ ok: true, flag });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create maintenance flag." },
      { status: 500 }
    );
  }
}
