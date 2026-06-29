import { NextResponse } from "next/server";
import { getPushEnvironmentDiagnostics } from "@/lib/server/staff-push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const diagnostics = getPushEnvironmentDiagnostics();
  const healthy = diagnostics.publicKeyValid && Boolean(diagnostics.selectedPrivateKeyName);

  return NextResponse.json({
    ok: true,
    healthy,
  });
}
