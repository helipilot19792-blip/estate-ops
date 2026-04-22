import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        { ok: false, error: "Missing authorization header." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return Response.json(
        { ok: false, error: "Missing access token." },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";

    if (!organizationId) {
      return Response.json(
        { ok: false, error: "Missing organizationId." },
        { status: 400 }
      );
    }

    return Response.json({
      ok: true,
      message: "Reset route reached.",
      organizationId,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}