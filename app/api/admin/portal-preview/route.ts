import { authenticateBearerRequest, createServiceRoleClient } from "@/lib/server/request-auth";
import { getOrganizationAccessErrorStatus } from "@/lib/server/organization-access";
import { requirePortalPreviewAdmin, requirePreviewAccount, loadOwnerPreviewDashboard } from "@/lib/server/portal-preview";
import { loadCleanerDashboard } from "@/lib/server/staff-dashboard";
import { writeAuditLog } from "@/lib/server/audit-log";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const auth = await authenticateBearerRequest(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: privateHeaders });
    const organizationId = new URL(request.url).searchParams.get("organizationId")?.trim();
    if (!organizationId) return Response.json({ error: "Organization is required." }, { status: 400, headers: privateHeaders });
    const service = createServiceRoleClient();
    await requirePortalPreviewAdmin(service, auth.user.id, organizationId);
    const [cleaners, owners] = await Promise.all([
      service.from("cleaner_accounts").select("id,display_name,email").eq("organization_id", organizationId).order("display_name"),
      service.from("owner_accounts").select("id,full_name,email").eq("organization_id", organizationId).order("full_name"),
    ]);
    if (cleaners.error || owners.error) throw new Error(cleaners.error?.message || owners.error?.message);
    return Response.json({ accounts: [
      ...(cleaners.data ?? []).map(row => ({ id: row.id, portal: "cleaner", name: row.display_name || row.email || "Cleaner", email: row.email })),
      ...(owners.data ?? []).map(row => ({ id: row.id, portal: "owner", name: row.full_name || row.email || "Owner", email: row.email })),
    ] }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load portal accounts." }, { status: getOrganizationAccessErrorStatus(error), headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBearerRequest(request);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: privateHeaders });
    const body = await request.json().catch(() => null);
    const { organizationId, accountId, portal } = body ?? {};
    if (typeof organizationId !== "string" || !organizationId.trim() || typeof accountId !== "string" || !accountId.trim() || (portal !== "cleaner" && portal !== "owner")) {
      return Response.json({ error: "Organization, account, and a supported portal are required." }, { status: 400, headers: privateHeaders });
    }
    const service = createServiceRoleClient();
    const admin = await requirePortalPreviewAdmin(service, auth.user.id, organizationId);
    const account = await requirePreviewAccount(service, organizationId, portal, accountId);
    const name = account.display_name || account.full_name || account.email || portal;
    let dashboard;
    if (portal === "cleaner") {
      // Account selection is scoped independently of the person's shared login.
      dashboard = {
        ...await loadCleanerDashboard(account.id, { organizationId, accountId }),
        profile: { id: account.id, full_name: name, email: account.email, phone: account.phone, role: "cleaner", created_at: account.created_at },
      };
    } else {
      dashboard = await loadOwnerPreviewDashboard(service, organizationId, account);
    }
    const logged = await writeAuditLog(service, {
      actorProfileId: auth.user.id, actorEmail: admin.email, actorRole: admin.role, organizationId,
      actionType: "portal_preview_started", targetType: `${portal}_account`, targetId: accountId,
      metadata: { portal, name, read_only: true },
    });
    if (!logged) throw new Error("Portal preview requires the audit log table to be available.");
    return Response.json({ portal, name, dashboard }, { headers: privateHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not open portal preview." }, { status: getOrganizationAccessErrorStatus(error), headers: privateHeaders });
  }
}
