import { NextRequest, NextResponse } from "next/server";
import {
  AdminV2AccessError,
  getAdminV2Access,
} from "@/lib/server/admin-v2/access";
import { isGuleraOsV2Enabled } from "@/lib/server/admin-v2/feature";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGuleraOsV2Enabled()) {
    return NextResponse.json(
      { ok: false, error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    const access = await getAdminV2Access(token);

    return NextResponse.json(
      { ok: true, ...access },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const status = error instanceof AdminV2AccessError ? error.status : 500;
    const message =
      error instanceof AdminV2AccessError
        ? error.message
        : "V2 access could not be verified.";

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
