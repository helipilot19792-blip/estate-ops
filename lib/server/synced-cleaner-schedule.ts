export type SyncedCleanerScheduleChange = {
  changed: boolean;
  previousScheduledFor: string | null;
  replacementScheduledFor: string;
};

export function getSyncedCleanerJobDate(job: {
  scheduled_for?: string | null;
  notes?: string | null;
}) {
  if (job.scheduled_for) return job.scheduled_for;
  const match = String(job.notes || "").match(/Checkout date:\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] || null;
}

export function getSyncedCleanerScheduleChange(
  job: { scheduled_for?: string | null; notes?: string | null },
  replacementScheduledFor: string
): SyncedCleanerScheduleChange {
  const previousScheduledFor = getSyncedCleanerJobDate(job);
  return {
    changed: Boolean(previousScheduledFor && previousScheduledFor !== replacementScheduledFor),
    previousScheduledFor,
    replacementScheduledFor,
  };
}
