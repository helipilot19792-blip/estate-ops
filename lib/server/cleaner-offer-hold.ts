export const CLEANER_OFFER_LEAD_DAY_OPTIONS = [60, 90, 180] as const;
export const DEFAULT_CLEANER_OFFER_LEAD_DAYS = 90;

export type CleanerOfferLeadDays = (typeof CLEANER_OFFER_LEAD_DAY_OPTIONS)[number];

function parseYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getTodayYmd(now = new Date()) {
  return formatYmd(now);
}

export function normalizePropertyCleanerOfferLeadDays(value: unknown): CleanerOfferLeadDays {
  const parsed = Number(value);
  return CLEANER_OFFER_LEAD_DAY_OPTIONS.includes(parsed as CleanerOfferLeadDays)
    ? (parsed as CleanerOfferLeadDays)
    : DEFAULT_CLEANER_OFFER_LEAD_DAYS;
}

export function normalizeManualCleanerOfferLeadDays(
  value: unknown,
  propertyDefault: unknown
): 0 | CleanerOfferLeadDays {
  const parsed = Number(value);
  if (parsed === 0) return 0;
  if (CLEANER_OFFER_LEAD_DAY_OPTIONS.includes(parsed as CleanerOfferLeadDays)) {
    return parsed as CleanerOfferLeadDays;
  }
  return normalizePropertyCleanerOfferLeadDays(propertyDefault);
}

export function calculateCleanerOfferEligibleDate(scheduledFor: string, leadDays: number) {
  const scheduledDate = parseYmd(scheduledFor);
  if (!scheduledDate || leadDays <= 0) return null;
  scheduledDate.setUTCDate(scheduledDate.getUTCDate() - Math.floor(leadDays));
  return formatYmd(scheduledDate);
}

export function getCleanerOfferHoldDecision(
  scheduledFor: string,
  leadDays: number,
  todayYmd = getTodayYmd()
) {
  const offerEligibleAt = calculateCleanerOfferEligibleDate(scheduledFor, leadDays);
  return {
    leadDays,
    offerEligibleAt,
    held: Boolean(offerEligibleAt && offerEligibleAt > todayYmd),
  };
}

