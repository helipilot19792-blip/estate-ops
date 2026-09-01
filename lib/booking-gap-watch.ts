export type BookingGapProperty = {
  id: string;
  name?: string | null;
  address?: string | null;
};

export type BookingGapEvent = {
  property_id: string;
  checkin_date: string;
  checkout_date: string;
};

export type BookingGapSuggestionKind =
  | "orphan_gap"
  | "open_weekend"
  | "midweek_gap"
  | "open_stretch";

export type BookingGapSuggestion = {
  key: string;
  propertyId: string;
  propertyName: string;
  kind: BookingGapSuggestionKind;
  urgency: "high" | "medium" | "low";
  startDate: string;
  endDate: string;
  nights: number;
  suggestedDiscountPercent: number;
  title: string;
  reason: string;
  recommendation: string;
};

export type BookingSeasonalitySignal = {
  isSlowSeason: boolean;
  confidence: "low" | "medium" | "high";
  connectedPropertyCount: number;
  evaluatedPropertyCount: number;
  slowingPropertyCount: number;
  recentOccupancyPercent: number;
  upcomingOccupancyPercent: number;
  occupancyChangePoints: number;
  recentWindowStart: string;
  recentWindowEnd: string;
  upcomingWindowStart: string;
  upcomingWindowEnd: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDaysYmd(value: string, days: number) {
  const date = parseYmd(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

function daysBetween(start: string, end: string) {
  const startDate = parseYmd(start);
  const endDate = parseYmd(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS));
}

function dayOfWeek(value: string) {
  return parseYmd(value)?.getUTCDay() ?? -1;
}

function findFirstOpenWeekend(startDate: string, endDate: string) {
  for (let cursor = startDate; cursor < endDate; cursor = addDaysYmd(cursor, 1)) {
    if (dayOfWeek(cursor) === 5 && addDaysYmd(cursor, 2) <= endDate) {
      return { startDate: cursor, endDate: addDaysYmd(cursor, 2) };
    }
  }
  return null;
}

function mergeOccupiedIntervals(events: BookingGapEvent[], startDate: string, endDate: string) {
  const intervals = events
    .map((event) => ({
      startDate: event.checkin_date < startDate ? startDate : event.checkin_date,
      endDate: event.checkout_date > endDate ? endDate : event.checkout_date,
    }))
    .filter((event) => event.startDate < event.endDate)
    .sort((left, right) => left.startDate.localeCompare(right.startDate));

  const merged: Array<{ startDate: string; endDate: string }> = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startDate > previous.endDate) {
      merged.push({ ...interval });
      continue;
    }
    if (interval.endDate > previous.endDate) previous.endDate = interval.endDate;
  }
  return merged;
}

function countOccupiedNights(events: BookingGapEvent[], startDate: string, endDate: string) {
  return mergeOccupiedIntervals(events, startDate, endDate).reduce(
    (total, interval) => total + daysBetween(interval.startDate, interval.endDate),
    0
  );
}

export function detectPortfolioSeasonality(options: {
  properties: BookingGapProperty[];
  bookings: BookingGapEvent[];
  connectedPropertyIds: Iterable<string>;
  todayYmd: string;
}): BookingSeasonalitySignal {
  const connectedPropertyIds = new Set(options.connectedPropertyIds);
  const connectedProperties = options.properties.filter((property) => connectedPropertyIds.has(property.id));
  const recentWindowStart = addDaysYmd(options.todayYmd, -60);
  const upcomingWindowEnd = addDaysYmd(options.todayYmd, 30);
  const bookingsByProperty = new Map<string, BookingGapEvent[]>();

  for (const booking of options.bookings) {
    const rows = bookingsByProperty.get(booking.property_id) ?? [];
    rows.push(booking);
    bookingsByProperty.set(booking.property_id, rows);
  }

  const evaluated: Array<{ recentNights: number; upcomingNights: number; slowing: boolean }> = [];
  for (const property of connectedProperties) {
    const bookings = bookingsByProperty.get(property.id) ?? [];
    const recentNights = countOccupiedNights(bookings, recentWindowStart, options.todayYmd);
    const upcomingNights = countOccupiedNights(bookings, options.todayYmd, upcomingWindowEnd);
    const recentPercent = (recentNights / 60) * 100;
    const upcomingPercent = (upcomingNights / 30) * 100;

    // A small amount of recent activity is not enough evidence to label a season.
    if (recentNights < 12) continue;
    evaluated.push({
      recentNights,
      upcomingNights,
      slowing: recentPercent >= 30 && upcomingPercent <= 50 && recentPercent - upcomingPercent >= 15,
    });
  }

  const connectedPropertyCount = connectedProperties.length;
  const evaluatedPropertyCount = evaluated.length;
  const slowingPropertyCount = evaluated.filter((item) => item.slowing).length;
  const recentOccupancyPercent = evaluatedPropertyCount > 0
    ? Math.round((evaluated.reduce((total, item) => total + item.recentNights, 0) / (evaluatedPropertyCount * 60)) * 100)
    : 0;
  const upcomingOccupancyPercent = evaluatedPropertyCount > 0
    ? Math.round((evaluated.reduce((total, item) => total + item.upcomingNights, 0) / (evaluatedPropertyCount * 30)) * 100)
    : 0;
  const occupancyChangePoints = upcomingOccupancyPercent - recentOccupancyPercent;
  const minimumEvidence = Math.max(2, Math.ceil(connectedPropertyCount * 0.6));
  const slowdownShare = evaluatedPropertyCount > 0 ? slowingPropertyCount / evaluatedPropertyCount : 0;
  const isSlowSeason =
    connectedPropertyCount >= 2 &&
    evaluatedPropertyCount >= minimumEvidence &&
    slowdownShare >= 0.67 &&
    occupancyChangePoints <= -15 &&
    upcomingOccupancyPercent <= 50;
  const confidence = !isSlowSeason
    ? "low"
    : evaluatedPropertyCount === connectedPropertyCount && slowdownShare >= 0.75 && occupancyChangePoints <= -25
      ? "high"
      : "medium";

  return {
    isSlowSeason,
    confidence,
    connectedPropertyCount,
    evaluatedPropertyCount,
    slowingPropertyCount,
    recentOccupancyPercent,
    upcomingOccupancyPercent,
    occupancyChangePoints,
    recentWindowStart,
    recentWindowEnd: options.todayYmd,
    upcomingWindowStart: options.todayYmd,
    upcomingWindowEnd,
  };
}

function buildSuggestion(
  property: BookingGapProperty,
  kind: BookingGapSuggestionKind,
  startDate: string,
  endDate: string,
  todayYmd: string
): BookingGapSuggestion {
  const nights = daysBetween(startDate, endDate);
  const leadDays = daysBetween(todayYmd, startDate);
  const propertyName = property.name?.trim() || property.address?.trim() || "Property";
  const urgency = leadDays <= 7 ? "high" : leadDays <= 14 ? "medium" : "low";
  const suggestedDiscountPercent = leadDays <= 7 || nights <= 2 ? 15 : 10;
  const key = `v1:${property.id}:${kind}:${startDate}:${endDate}`;

  if (kind === "orphan_gap") {
    return {
      key,
      propertyId: property.id,
      propertyName,
      kind,
      urgency,
      startDate,
      endDate,
      nights,
      suggestedDiscountPercent,
      title: `${nights}-night gap between reservations`,
      reason: `${propertyName} has a short opening between two synced stays. Short gaps can be harder to fill as the dates approach.`,
      recommendation: `Consider a targeted ${suggestedDiscountPercent}% promotion for these dates or adjusting the minimum stay.`,
    };
  }

  if (kind === "open_weekend") {
    return {
      key,
      propertyId: property.id,
      propertyName,
      kind,
      urgency,
      startDate,
      endDate,
      nights,
      suggestedDiscountPercent,
      title: "Upcoming weekend is still open",
      reason: `${propertyName} has both Friday and Saturday nights unbooked on its synced calendars.`,
      recommendation: `Consider a ${suggestedDiscountPercent}% weekend promotion or a two-night package.`,
    };
  }

  if (kind === "midweek_gap") {
    return {
      key,
      propertyId: property.id,
      propertyName,
      kind,
      urgency,
      startDate,
      endDate,
      nights,
      suggestedDiscountPercent,
      title: `${nights}-night opening is approaching`,
      reason: `${propertyName} has an unbooked opening on its synced calendars.`,
      recommendation: `Consider a ${suggestedDiscountPercent}% date-specific promotion or a shorter minimum stay.`,
    };
  }

  return {
    key,
    propertyId: property.id,
    propertyName,
    kind,
    urgency,
    startDate,
    endDate,
    nights,
    suggestedDiscountPercent,
    title: `${nights}-night open stretch is approaching`,
    reason: `${propertyName} has a longer unbooked stretch on its synced calendars.`,
    recommendation: `Consider a ${suggestedDiscountPercent}% promotion for part or all of this opening.`,
  };
}

export function detectBookingGapSuggestions(options: {
  properties: BookingGapProperty[];
  bookings: BookingGapEvent[];
  connectedPropertyIds: Iterable<string>;
  todayYmd: string;
  horizonDays?: number;
}) {
  const horizonDays = Math.max(14, Math.min(90, options.horizonDays ?? 45));
  const horizonEnd = addDaysYmd(options.todayYmd, horizonDays);
  const connectedPropertyIds = new Set(options.connectedPropertyIds);
  const bookingsByProperty = new Map<string, BookingGapEvent[]>();

  for (const booking of options.bookings) {
    const rows = bookingsByProperty.get(booking.property_id) ?? [];
    rows.push(booking);
    bookingsByProperty.set(booking.property_id, rows);
  }

  const suggestions: BookingGapSuggestion[] = [];

  for (const property of options.properties) {
    if (!connectedPropertyIds.has(property.id)) continue;

    const occupied = mergeOccupiedIntervals(
      bookingsByProperty.get(property.id) ?? [],
      options.todayYmd,
      horizonEnd
    );
    const gaps: Array<{ startDate: string; endDate: string; boundedBefore: boolean; boundedAfter: boolean }> = [];
    let cursor = options.todayYmd;

    for (const interval of occupied) {
      if (interval.startDate > cursor) {
        gaps.push({
          startDate: cursor,
          endDate: interval.startDate,
          boundedBefore: cursor !== options.todayYmd,
          boundedAfter: true,
        });
      }
      if (interval.endDate > cursor) cursor = interval.endDate;
    }

    if (cursor < horizonEnd) {
      gaps.push({
        startDate: cursor,
        endDate: horizonEnd,
        boundedBefore: occupied.length > 0,
        boundedAfter: false,
      });
    }

    for (const gap of gaps) {
      const nights = daysBetween(gap.startDate, gap.endDate);
      const leadDays = daysBetween(options.todayYmd, gap.startDate);
      if (nights === 0 || leadDays > 30) continue;

      if (nights <= 2 && gap.boundedBefore && gap.boundedAfter) {
        suggestions.push(buildSuggestion(property, "orphan_gap", gap.startDate, gap.endDate, options.todayYmd));
        continue;
      }

      if (nights >= 5) {
        const endDate = addDaysYmd(gap.startDate, Math.min(nights, 14));
        suggestions.push(buildSuggestion(property, "open_stretch", gap.startDate, endDate, options.todayYmd));
        continue;
      }

      const weekend = findFirstOpenWeekend(gap.startDate, gap.endDate);
      if (weekend) {
        suggestions.push(
          buildSuggestion(property, "open_weekend", weekend.startDate, weekend.endDate, options.todayYmd)
        );
        continue;
      }

      if (nights >= 3) {
        suggestions.push(buildSuggestion(property, "midweek_gap", gap.startDate, gap.endDate, options.todayYmd));
      }
    }
  }

  const urgencyRank = { high: 0, medium: 1, low: 2 } as const;
  return suggestions.sort((left, right) =>
    urgencyRank[left.urgency] - urgencyRank[right.urgency] ||
    left.startDate.localeCompare(right.startDate) ||
    left.propertyName.localeCompare(right.propertyName)
  );
}
