import { NextRequest, NextResponse } from "next/server";
import {
  getAiCopilotBearerToken,
  requireAiCopilotAccess,
} from "@/lib/server/ai-copilot-access";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = getAiCopilotBearerToken(request);
    const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim() || "";

    const access = await requireAiCopilotAccess({
      token,
      organizationId,
    });

    return NextResponse.json({
      ok: true,
      organizationId,
      access: {
        allowed: access.gate.allowed,
        reason: access.gate.reason,
        globalEnabled: access.gate.globalEnabled,
        organizationEnabled: access.gate.organizationEnabled,
        userEnabled: access.gate.userEnabled,
      },
      profile: {
        id: access.profile.id,
        email: access.profile.email,
        full_name: access.profile.full_name,
        role: access.profile.role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify AI Copilot access.";
    const status =
      message === "Missing authorization header." || message === "Not authenticated."
        ? 401
        : message === "Missing organizationId."
          ? 400
          : message === "Admin access required for this organization."
            ? 403
            : message.includes("disabled") || message.includes("not enabled") || message.includes("controls")
              ? 403
              : 500;

    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
