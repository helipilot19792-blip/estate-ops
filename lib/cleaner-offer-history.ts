export type CleanerOfferHistoryAuditLog = {
  id: string;
  action_type: string;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type HistoricalCleanerDecline = {
  id: string;
  cleanerAccountId: string;
  source: "portal" | "email" | "admin";
  offeredAt: string | null;
  declinedAt: string | null;
};

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function getDeclineCleanerAccountId(log: CleanerOfferHistoryAuditLog) {
  return (
    metadataText(log.metadata, "cleaner_account_id") ||
    metadataText(log.metadata, "offered_account_id")
  );
}

function getDeclineSource(actionType: string): HistoricalCleanerDecline["source"] | null {
  if (actionType === "cleaner.portal_job_decline") return "portal";
  if (actionType === "cleaner.email_job_decline") return "email";
  if (actionType === "admin.decline_cleaner_job_on_behalf") return "admin";
  return null;
}

export function isCleanerReassignmentAuditAction(actionType: string) {
  return [
    "admin.reassign_cleaner_slot",
    "admin.assign_self_cleaner",
    "cleaner.release_cleaner_slot",
    "ai.supervisor.turnover_rescue_approved",
  ].includes(actionType);
}

export function isCleanerReleaseToStrandedAuditAction(actionType: string) {
  return [
    "cleaner.release_cleaner_slot_stranded",
    "admin.approve_cleaner_release_request",
    "admin.release_cleaner_future_job_stranded",
  ].includes(actionType);
}

export function getUnrepresentedCleanerDeclines(
  logs: CleanerOfferHistoryAuditLog[],
  currentSlot: { cleanerAccountId?: string | null; status?: string | null }
) {
  const declinesRepresentedByReassignment = new Set<string>();

  for (const log of logs) {
    if (!isCleanerReassignmentAuditAction(log.action_type)) continue;

    const previousStatus = metadataText(log.metadata, "previous_status").toLowerCase();
    const reassignSource = metadataText(log.metadata, "reassign_source").toLowerCase();
    if (previousStatus !== "declined" && !reassignSource.endsWith("_declined")) continue;

    const cleanerAccountId = metadataText(log.metadata, "previous_cleaner_account_id");
    if (cleanerAccountId) declinesRepresentedByReassignment.add(cleanerAccountId);
  }

  const currentCleanerAccountId = String(currentSlot.cleanerAccountId || "").trim();
  const currentStatus = String(currentSlot.status || "").trim().toLowerCase();

  return logs.flatMap((log): HistoricalCleanerDecline[] => {
    const source = getDeclineSource(log.action_type);
    if (!source) return [];

    const cleanerAccountId = getDeclineCleanerAccountId(log);
    if (!cleanerAccountId || declinesRepresentedByReassignment.has(cleanerAccountId)) return [];
    if (currentStatus === "declined" && cleanerAccountId === currentCleanerAccountId) return [];

    return [{
      id: log.id,
      cleanerAccountId,
      source,
      offeredAt:
        metadataText(log.metadata, "previous_offered_at") ||
        metadataText(log.metadata, "offered_at") ||
        metadataText(log.metadata, "offer_version") ||
        null,
      declinedAt:
        metadataText(log.metadata, "previous_declined_at") ||
        log.created_at ||
        null,
    }];
  });
}
