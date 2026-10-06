import { getSignedInProfile, loadCleanerDashboard, loadGroundsDashboard } from "@/lib/server/staff-dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : "";
    const portal = new URL(request.url).searchParams.get("portal");

    if (!token) {
      return Response.json({ ok: false, error: "Missing authorization header." }, { status: 401 });
    }

    if (portal !== "cleaner" && portal !== "grounds") {
      return Response.json({ ok: false, error: "Unknown staff portal." }, { status: 400 });
    }

    const { profile } = await getSignedInProfile(token);
    const data = portal === "cleaner" ? await loadCleanerDashboard(profile.id) : await loadGroundsDashboard(profile.id);

    return Response.json({
      ok: true,
      profile,
      ...data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load staff dashboard.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
