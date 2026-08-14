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
  return expirationSweep.toISOString();
}

export function isCleanerJobDatePast(jobDate: string | null, now = new Date()) {
  if (!jobDate || !/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) return false;
  return jobDate < now.toISOString().slice(0, 10);
}

export function isCleanerOfferInFinalWarningWindow(expiresAt: string | null, now = new Date()) {
  if (!expiresAt) return false;

  const expirationTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expirationTime) || expirationTime <= now.getTime()) return false;

  return expirationTime - now.getTime() <= 24 * 60 * 60 * 1000;
}
