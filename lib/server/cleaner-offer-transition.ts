export type CleanerOfferSlotSnapshot = {
  cleanerAccountId: string | null;
  status: string | null;
  offeredAt: string | null;
  expiresAt: string | null;
};

type CleanerOfferSlot = {
  cleaner_account_id?: string | null;
  status?: string | null;
  offered_at?: string | null;
  expires_at?: string | null;
};

export function shouldReofferCleanerSlot(
  slot: CleanerOfferSlot,
  expectedExpiredOffer?: CleanerOfferSlotSnapshot,
  nowMs = Date.now()
) {
  const status = String(slot.status || "").trim().toLowerCase();

  // Interactive decline flows call the rotation helper without an expiration
  // snapshot. Only the declined state is valid in that case. This makes a
  // repeated decline request harmless if another request already offered the
  // slot to the next cleaner.
  if (!expectedExpiredOffer) return status === "declined";

  const expiresAtMs = new Date(String(slot.expires_at || "")).getTime();
  return (
    status === "offered" &&
    slot.cleaner_account_id === expectedExpiredOffer.cleanerAccountId &&
    String(slot.status || "") === String(expectedExpiredOffer.status || "") &&
    String(slot.offered_at || "") === String(expectedExpiredOffer.offeredAt || "") &&
    String(slot.expires_at || "") === String(expectedExpiredOffer.expiresAt || "") &&
    Number.isFinite(expiresAtMs) &&
    expiresAtMs <= nowMs
  );
}
