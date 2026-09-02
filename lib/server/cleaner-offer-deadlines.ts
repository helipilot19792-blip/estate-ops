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
  if (!jobDate) return 2;

  const scheduled = new Date(`${jobDate}T12:00:00Z`);
  if (Number.isNaN(scheduled.getTime())) return 2;

  const daysUntilCleaning = (scheduled.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysUntilCleaning > 21) return 5;
  if (daysUntilCleaning > 7) return 3;
  if (daysUntilCleaning > 2) return 2;
  return 1;
}

export function getCleanerOfferExpiresAtForDailySweep(jobDate: string | null, now = new Date()) {
  const firstUpcomingSweep = new Date(now);
  firstUpcomingSweep.setUTCHours(12, 0, 0, 0);
  if (firstUpcomingSweep.getTime() <= now.getTime()) {
    firstUpcomingSweep.setUTCDate(firstUpcomingSweep.getUTCDate() + 1);
  }

  const expirationSweep = new Date(firstUpcomingSweep);
  expirationSweep.setUTCDate(
    expirationSweep.getUTCDate() + getCleanerOfferResponseDays(jobDate, now) - 1
  );

  // Offers for jobs beyond tomorrow must always receive at least 24 full hours.
  // Since expiry processing runs on the daily sweep, advance to the next sweep
  // whenever the normal deadline would cut that minimum window short.
  const jobDateYmd = jobDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const tomorrowYmd = addCalendarDays(getOperationsDateYmd(now), 1);
  const jobIsBeyondTomorrow = jobDateYmd > tomorrowYmd;
  const minimumResponseTime = now.getTime() + 24 * 60 * 60 * 1000;
  while (jobIsBeyondTomorrow && expirationSweep.getTime() < minimumResponseTime) {
    expirationSweep.setUTCDate(expirationSweep.getUTCDate() + 1);
  }

  return expirationSweep.toISOString();
}

export function isCleanerJobDatePast(jobDate: string | null, now = new Date()) {
  if (!jobDate || !/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) return false;
  return jobDate < getOperationsDateYmd(now);
}

export function isCleanerOfferInFinalWarningWindow(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false;

  const expirationTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expirationTime) || expirationTime <= now.getTime()) return false;

  return expirationTime - now.getTime() <= 24 * 60 * 60 * 1000;
}
