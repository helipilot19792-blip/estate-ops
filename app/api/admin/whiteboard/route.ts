import { authenticateBearerRequest, createServiceRoleClient } from "@/lib/server/request-auth";
import { requireOrganizationAdmin, getOrganizationAccessErrorStatus } from "@/lib/server/organization-access";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  try {
    const auth = await authenticateBearerRequest(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return Response.json({ error: "Choose an organization." }, { status: 400 });
    const service = createServiceRoleClient();
    await requireOrganizationAdmin(service, auth.user.id, organizationId);
    // No cross-organization platform-admin bypass for private whiteboards.
    const membership = await service.from("organization_members").select("role")
      .eq("organization_id", organizationId).eq("profile_id", auth.user.id).eq("role", "admin").maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) return Response.json({ error: "Only this organization’s admins can access its whiteboard." }, { status: 403 });

    if (request.method === "GET") {
      const result = await service.from("admin_whiteboard_tasks").select("*")
        .eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return Response.json({ tasks: result.data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid task." }, { status: 400 });
    if (request.method === "POST") {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const dueDate = body.dueDate || null;
      if (!title || title.length > 200 || notes.length > 5000 ||
        (dueDate !== null && (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)))) {
        return Response.json({ error: "Enter a title up to 200 characters, notes up to 5,000 characters, and a valid due date." }, { status: 400 });
      }
      const result = await service.from("admin_whiteboard_tasks").insert({
        organization_id: organizationId, title, notes, due_date: dueDate, created_by: auth.user.id,
      }).select().single();
      if (result.error) throw result.error;
      return Response.json({ task: result.data }, { status: 201 });
    }
    if (typeof body.id !== "string" || typeof body.completed !== "boolean") {
      return Response.json({ error: "Choose a task and completion status." }, { status: 400 });
    }
    const result = await service.from("admin_whiteboard_tasks").update({
      completed_at: body.completed ? new Date().toISOString() : null,
      completed_by: body.completed ? auth.user.id : null,
    }).eq("organization_id", organizationId).eq("id", body.id).select().maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return Response.json({ error: "Task not found." }, { status: 404 });
    return Response.json({ task: result.data });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "PGRST205" || code === "42P01") {
      return Response.json({ error: "Whiteboard setup is pending. Apply the admin whiteboard database migration, then retry." }, { status: 503 });
    }
    const status = getOrganizationAccessErrorStatus(error);
    console.error("Admin whiteboard request failed", error);
    return Response.json({ error: status === 403 ? "Admin access required." : "Could not save or load whiteboard tasks. Please retry." }, { status });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
