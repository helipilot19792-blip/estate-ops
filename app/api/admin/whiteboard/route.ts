import { authenticateBearerRequest, createServiceRoleClient } from "@/lib/server/request-auth";
import { getOrganizationAccessErrorStatus } from "@/lib/server/organization-access";
import { isValidDrawing } from "@/lib/whiteboard-drawing";
import { after } from "next/server";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

export const dynamic = "force-dynamic";

function notifyAssignee(task: { id: string; title: string; assigned_to?: string | null }, organizationId: string) {
  if (!task.assigned_to) return;
  const assigneeId = task.assigned_to;
  after(async () => {
    try {
      const result = await sendStaffPushNotifications("admin", [assigneeId], {
        title: "New Whiteboard assignment",
        body: task.title,
        url: `/admin?open=whiteboard&organizationId=${encodeURIComponent(organizationId)}`,
        tag: `whiteboard-assignment-${task.id}`,
      });
      if (result.errors.length) console.error("Whiteboard assignment push failed", result.errors);
    } catch (error) {
      console.error("Whiteboard assignment push failed", error);
    }
  });
}

async function handle(request: Request) {
  try {
    const auth = await authenticateBearerRequest(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    const organizationId = new URL(request.url).searchParams.get("organizationId") || "";
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return Response.json({ error: "Choose an organization." }, { status: 400 });
    const service = createServiceRoleClient();
    // Check profile and membership together, once. Platform admins still need
    // explicit membership to access this organization's private whiteboard.
    const [profile, membership] = await Promise.all([
      service.from("profiles").select("role").eq("id", auth.user.id).maybeSingle(),
      service.from("organization_members").select("role")
        .eq("organization_id", organizationId).eq("profile_id", auth.user.id).eq("role", "admin").maybeSingle(),
    ]);
    if (profile.error) throw profile.error;
    if (membership.error) throw membership.error;
    if (!profile.data || !["admin", "platform_admin"].includes(profile.data.role)) return Response.json({ error: "Admin access required." }, { status: 403 });
    if (!membership.data) return Response.json({ error: "Only this organization’s admins can access its whiteboard." }, { status: 403 });

    const resource = new URL(request.url).searchParams.get("resource");
    if (resource === "settings") {
      if (request.method === "GET") {
        const result = await service.from("admin_whiteboard_drawings").select("board_title")
          .eq("organization_id", organizationId).maybeSingle();
        if (result.error && !["42703", "PGRST204"].includes(result.error.code)) throw result.error;
        return Response.json({ title: result.data?.board_title || "Our whiteboard" }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method !== "PUT") return Response.json({ error: "Method not allowed." }, { status: 405 });
      const body = await request.json().catch(() => null);
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      if (!title || title.length > 120) return Response.json({ error: "Enter a board name up to 120 characters." }, { status: 400 });
      const initial = await service.from("admin_whiteboard_drawings").upsert({ organization_id: organizationId }, { onConflict: "organization_id", ignoreDuplicates: true });
      if (initial.error) throw initial.error;
      const result = await service.from("admin_whiteboard_drawings").update({ board_title: title })
        .eq("organization_id", organizationId).select("board_title").single();
      if (result.error) return Response.json({ error: "Could not rename the board. Ensure the whiteboard title migration (20260910050000) is applied, then retry." }, { status: 503 });
      return Response.json({ title: result.data.board_title });
    }
    if (resource === "gallery" || resource?.startsWith("gallery/")) {
      const id = resource.includes("/") ? resource.slice("gallery/".length) : null;
      if (request.method === "GET") {
        const query = service.from("admin_whiteboard_saved_drawings")
          .select(id ? "id,title,strokes,revision,updated_at" : "id,title,revision,updated_at")
          .eq("organization_id", organizationId);
        const result = id ? await query.eq("id", id).maybeSingle() : await query.order("updated_at", { ascending: false });
        if (result.error) throw result.error;
        if (id && !result.data) return Response.json({ error: "Saved drawing not found." }, { status: 404 });
        return Response.json(id ? { drawing: result.data } : { drawings: result.data }, { headers: { "Cache-Control": "private, no-store" } });
      }
      if (!["POST", "PUT", "DELETE"].includes(request.method)) return Response.json({ error: "Method not allowed." }, { status: 405 });
      const text = await request.text();
      if (text.length > 1_000_000) return Response.json({ error: "Drawing is too large." }, { status: 413 });
      const body = (() => { try { return JSON.parse(text); } catch { return null; } })();
      if (!body || (request.method !== "POST" && (typeof body.id !== "string" || !Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision >= 2147483647))) {
        return Response.json({ error: "Choose a saved drawing and its version." }, { status: 400 });
      }
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (request.method !== "DELETE" && (!title || title.length > 120 || !isValidDrawing(body.strokes))) {
        return Response.json({ error: "Enter a drawing name (up to 120 characters) and a valid drawing." }, { status: 400 });
      }
      if (request.method === "POST") {
        const result = await service.from("admin_whiteboard_saved_drawings").insert({
          organization_id: organizationId, title, strokes: body.strokes, updated_by: auth.user.id,
        }).select("id,title,strokes,revision,updated_at").single();
        if (result.error) throw result.error;
        return Response.json({ drawing: result.data }, { status: 201 });
      }
      const query = request.method === "DELETE"
        ? service.from("admin_whiteboard_saved_drawings").delete()
        : service.from("admin_whiteboard_saved_drawings").update({ title, strokes: body.strokes,
          revision: body.revision + 1, updated_at: new Date().toISOString(), updated_by: auth.user.id });
      const result = await query.eq("organization_id", organizationId).eq("id", body.id).eq("revision", body.revision)
        .select("id,title,strokes,revision,updated_at").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return Response.json({ error: "This drawing was changed or removed. Save a copy of your work or load the latest version before trying again." }, { status: 409 });
      return Response.json(request.method === "DELETE" ? { deletedId: result.data.id } : { drawing: result.data });
    }
    if (resource === "admins" && request.method === "GET") {
      const members = await service.from("organization_members").select("profile_id")
        .eq("organization_id", organizationId).eq("role", "admin");
      if (members.error) throw members.error;
      const ids = (members.data ?? []).map((row) => row.profile_id);
      const profiles = ids.length ? await service.from("profiles").select("id,full_name,email")
        .in("id", ids).in("role", ["admin", "platform_admin"]) : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      return Response.json({ admins: profiles.data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (resource === "drawing") {
      if (request.method === "GET") {
        const drawing = await service.from("admin_whiteboard_drawings").select("strokes,revision,updated_at")
          .eq("organization_id", organizationId).maybeSingle();
        if (drawing.error) throw drawing.error;
        return Response.json({ drawing: drawing.data ?? { strokes: [], revision: 0, updated_at: null } },
          { headers: { "Cache-Control": "private, no-store" } });
      }
      if (request.method !== "PUT") return Response.json({ error: "Method not allowed." }, { status: 405 });
      const text = await request.text();
      if (text.length > 1_000_000) return Response.json({ error: "Drawing is too large." }, { status: 413 });
      const body = (() => { try { return JSON.parse(text); } catch { return null; } })();
      if (!body || !isValidDrawing(body.strokes) || !Number.isSafeInteger(body.revision) || body.revision < 0 || body.revision >= 2147483647) {
        return Response.json({ error: "Invalid drawing or drawing is too large." }, { status: 400 });
      }
      // Initialize once, then compare revisions so two admins cannot silently
      // overwrite each other's drawings. A retry after a lost response is safe.
      const initial = await service.from("admin_whiteboard_drawings").upsert({ organization_id: organizationId },
        { onConflict: "organization_id", ignoreDuplicates: true });
      if (initial.error) throw initial.error;
      const saved = await service.from("admin_whiteboard_drawings").update({
        strokes: body.strokes, revision: body.revision + 1,
        updated_at: new Date().toISOString(), updated_by: auth.user.id,
      }).eq("organization_id", organizationId).eq("revision", body.revision)
        .select("strokes,revision,updated_at").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data) return Response.json({ error: "Another admin saved a newer drawing. Download your sketch before loading the latest board." }, { status: 409 });
      return Response.json({ drawing: saved.data });
    }
    if (request.method === "PUT") return Response.json({ error: "Method not allowed." }, { status: 405 });

    if (request.method === "GET") {
      const result = await service.from("admin_whiteboard_tasks").select("*")
        .eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return Response.json({ tasks: result.data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const body = await request.json().catch(() => null);
    if (!body) return Response.json({ error: "Invalid task." }, { status: 400 });
    if (request.method === "DELETE" || (request.method === "PATCH" && (body.action === "archive" || body.action === "restore"))) {
      if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > 500 ||
        body.ids.some((id: unknown) => typeof id !== "string" || !id)) {
        return Response.json({ error: "Choose between 1 and 500 completed tasks." }, { status: 400 });
      }
      const query = request.method === "DELETE"
        ? service.from("admin_whiteboard_tasks").delete()
        : service.from("admin_whiteboard_tasks").update({ archived_at: body.action === "archive" ? new Date().toISOString() : null });
      // Apply the completion and tenant checks atomically, including bulk actions.
      // A task reopened by another admin must not be removed by a stale screen.
      const result = await query.eq("organization_id", organizationId).in("id", body.ids)
        .not("completed_at", "is", null).select();
      if (result.error) throw result.error;
      return Response.json(request.method === "DELETE"
        ? { deletedIds: (result.data ?? []).map((task) => task.id) }
        : { tasks: result.data ?? [] });
    }
    const assigning = Object.hasOwn(body, "assignedTo");
    if (assigning && body.assignedTo !== null) {
      if (typeof body.assignedTo !== "string") return Response.json({ error: "Choose an admin." }, { status: 400 });
      const assignee = await service.from("organization_members").select("profile_id")
        .eq("organization_id", organizationId).eq("profile_id", body.assignedTo).eq("role", "admin").maybeSingle();
      if (assignee.error) throw assignee.error;
      const profile = await service.from("profiles").select("id").eq("id", body.assignedTo)
        .in("role", ["admin", "platform_admin"]).maybeSingle();
      if (profile.error) throw profile.error;
      if (!assignee.data || !profile.data) return Response.json({ error: "Assign tasks only to an admin in this organization." }, { status: 400 });
    }
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
        ...(assigning ? { assigned_to: body.assignedTo } : {}),
      }).select().single();
      if (result.error) throw result.error;
      notifyAssignee(result.data, organizationId);
      return Response.json({ task: result.data }, { status: 201 });
    }
    if (typeof body.id !== "string" || (!assigning && typeof body.completed !== "boolean") ||
      (Object.hasOwn(body, "completed") && typeof body.completed !== "boolean")) {
      return Response.json({ error: "Choose a task and completion status." }, { status: 400 });
    }
    let previousAssignee: string | null = null;
    if (assigning) {
      const previous = await service.from("admin_whiteboard_tasks").select("assigned_to")
        .eq("organization_id", organizationId).eq("id", body.id).maybeSingle();
      if (previous.error) throw previous.error;
      if (!previous.data) return Response.json({ error: "Task not found." }, { status: 404 });
      previousAssignee = previous.data.assigned_to ?? null;
    }
    let query = service.from("admin_whiteboard_tasks").update({
      ...(typeof body.completed === "boolean" ? {
        completed_at: body.completed ? new Date().toISOString() : null,
        completed_by: body.completed ? auth.user.id : null,
        ...(!body.completed ? { archived_at: null } : {}),
      } : {}),
      ...(assigning ? { assigned_to: body.assignedTo } : {}),
    }).eq("organization_id", organizationId).eq("id", body.id);
    // Compare the saved assignee atomically so concurrent requests cannot send
    // duplicate assignment notifications or overwrite a newer assignment.
    if (assigning) query = previousAssignee === null ? query.is("assigned_to", null) : query.eq("assigned_to", previousAssignee);
    const result = await query.select().maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return Response.json({ error: assigning ? "This assignment changed. Refresh and retry." : "Task not found." }, { status: assigning ? 409 : 404 });
    if (assigning && result.data.assigned_to !== previousAssignee) notifyAssignee(result.data, organizationId);
    return Response.json({ task: result.data });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "PGRST205" || code === "42P01" || code === "PGRST204" || code === "42703") {
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
export const PUT = handle;
export const DELETE = handle;
