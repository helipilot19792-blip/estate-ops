import { createHash, randomBytes } from "crypto";

type BookingLike = {
  summary?: string | null;
  checkin_date: string;
  checkout_date: string;
};

export function createGuestDeviceToken() {
  return `gdev_${randomBytes(24).toString("base64url")}`;
}

export function hashGuestDeviceToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function getGuestLabel(summary?: string | null) {
  const cleaned = String(summary || "")
    .replace(/\s+/g, " ")
    .replace(/^(reserved|reservation|booking|booked)\s*[-:]\s*/i, "")
    .trim();

  if (!cleaned) return null;
  if (/^(reserved|reservation|booking|booked|blocked|busy|not available|unavailable)$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

export function getFirstNameFromBookingSummary(summary?: string | null) {
  const guestLabel = getGuestLabel(summary);
  if (!guestLabel) return null;

  const beforeEmail = guestLabel.includes("@") ? guestLabel.split("@")[0] : guestLabel;
  const token = beforeEmail
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .find(Boolean);

  if (!token) return null;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function getTodayYmd(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function pickRelevantBooking<T extends BookingLike>(events: T[], todayYmd = getTodayYmd()) {
  const current = events
    .filter((event) => event.checkin_date <= todayYmd && event.checkout_date > todayYmd)
    .sort((a, b) => a.checkout_date.localeCompare(b.checkout_date))[0];

  if (current) {
    return {
      stayStatus: "current" as const,
      booking: current,
    };
  }

  const upcoming = events
    .filter((event) => event.checkin_date >= todayYmd)
    .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date))[0];

  if (upcoming) {
    return {
      stayStatus: "upcoming" as const,
      booking: upcoming,
    };
  }

  return {
    stayStatus: "none" as const,
    booking: null,
  };
}
