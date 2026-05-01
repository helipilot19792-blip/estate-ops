import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditLogEntryInput = {
  actorProfileId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  organizationId?: string | null;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function writeAuditLog(
  serviceClient: SupabaseClient,
  entry: AuditLogEntryInput
) {
  const { error } = await serviceClient.from("audit_logs").insert({
    actor_profile_id: entry.actorProfileId || null,
    actor_email: entry.actorEmail || null,
    actor_role: entry.actorRole || null,
    organization_id: entry.organizationId || null,
    action_type: entry.actionType,
    target_type: entry.targetType || null,
    target_id: entry.targetId || null,
    metadata: entry.metadata || {},
  });

  if (error) {
    throw new Error(error.message);
  }
}
