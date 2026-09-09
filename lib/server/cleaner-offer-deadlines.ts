const CLEANER_OPERATIONS_TIME_ZONE = "America/Toronto";

function getOperationsDateYmd(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLEANER_OPERATIONS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : now.toISOString().slice(0, 10);
}

function addCalendarDays(dateYmd: string, days: number) {
  const date = new Date(`${dateYmd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getCleanerOfferResponseDays(jobDate: string | null, now = new Date()) {
  if (!jobDate) return 1;
  const scheduled = new Date(`${jobDate}T12:00:00Z`);
  if (Number.isNaN(scheduled.getTime())) return 1;
  const today = new Date(`${getOperationsDateYmd(now)}T12:00:00Z`);
  const daysUntilCleaning = (scheduled.getTime() - today.getTime()) / 86_400_000;
  if (daysUntilCleaning >= 28) return 5;
  if (daysUntilCleaning >= 14) return 3;
  return 1;
}

export function getCleanerOfferExpiresAtForDailySweep(jobDate: string | null, now = new Date()) {
  const deadlineDate = addCalendarDays(
    getOperationsDateYmd(now), getCleanerOfferResponseDays(jobDate, now)
  );
  // At 10 a.m. Toronto is unambiguously on the new offset even on DST transition days.
  const candidate = new Date(`${deadlineDate}T15:00:00Z`);
  const localHour = Number(new Intl.DateTimeFormat("en-CA", {
    timeZone: CLEANER_OPERATIONS_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(candidate));
  candidate.setUTCHours(candidate.getUTCHours() + 10 - localHour);
  return candidate.toISOString();
}

export function isCleanerJobDatePast(jobDate: string | null, now = new Date()) {
  if (!jobDate || !/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) return false;
  return jobDate < getOperationsDateYmd(now);
}

// Database slot creation can still supply the legacy eight-hour deadline.
// Apply the response policy before notifying cleaners, preserving longer offers.
export function getInitialCleanerOfferDeadline(
  jobDate: string | null,
  offeredAt: string | null,
  expiresAt: string | null,
  now = new Date()
) {
  const offered = offeredAt ? new Date(offeredAt) : now;
  const base = Number.isNaN(offered.getTime()) ? now : offered;
  const policyDeadline = getCleanerOfferExpiresAtForDailySweep(jobDate, base);
  const storedTime = expiresAt ? new Date(expiresAt).getTime() : NaN;
  return storedTime >= new Date(policyDeadline).getTime() ? expiresAt! : policyDeadline;
}

export function isCleanerOfferInFinalWarningWindow(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false;

  const expirationTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expirationTime) || expirationTime <= now.getTime()) return false;

  return expirationTime - now.getTime() <= 24 * 60 * 60 * 1000;
}
