import { NextResponse } from "next/server";
import { getPushEnvironmentDiagnostics } from "@/lib/server/staff-push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    diagnostics: getPushEnvironmentDiagnostics(),
  });
}
