import { NextRequest, NextResponse } from "next/server";
import { AdminV2AccessError } from "@/lib/server/admin-v2/access";
import {
  AdminV2BriefingError,
  getAdminV2Briefing,
} from "@/lib/server/admin-v2/briefing";
import { isGuleraOsV2Enabled } from "@/lib/server/admin-v2/feature";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isGuleraOsV2Enabled()) {
    return NextResponse.json(
      { ok: false, error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";
    const briefing = await getAdminV2Briefing(token, organizationId);

    return NextResponse.json(
      { ok: true, briefing },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status = error instanceof AdminV2AccessError || error instanceof AdminV2BriefingError
      ? error.status
      : 500;
    const message = error instanceof AdminV2AccessError || error instanceof AdminV2BriefingError
      ? error.message
      : "The read-only V2 briefing could not be prepared.";

    return NextResponse.json(
      { ok: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
