type CleanerOfferDeadlineInput = {
  expiresAt?: string | null;
  offeredAt?: string | null;
  jobDate?: string | null;
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getLegacyResponseWindowHours(jobDate: string | null | undefined, now: Date) {
  if (!jobDate) return 8;

  const job = new Date(`${jobDate}T12:00:00`);
  if (Number.isNaN(job.getTime())) return 8;

  const diffHours = (job.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (diffHours > 24 * 7) return 48;
  if (diffHours > 48) return 8;
  return 2;
}

export function getCleanerOfferDeadline(input: CleanerOfferDeadlineInput, now = new Date()) {
  const storedDeadline = parseDate(input.expiresAt);
  if (storedDeadline) return storedDeadline;

  const offeredAt = parseDate(input.offeredAt);
  if (!offeredAt) return null;

  const legacyHours = getLegacyResponseWindowHours(input.jobDate, now);
  return new Date(offeredAt.getTime() + legacyHours * 60 * 60 * 1000);
}

export function getCleanerOfferTimeRemainingMs(
  input: CleanerOfferDeadlineInput,
  now = new Date()
) {
  const deadline = getCleanerOfferDeadline(input, now);
  return deadline ? deadline.getTime() - now.getTime() : null;
}
