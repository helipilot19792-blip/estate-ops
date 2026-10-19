type OwnerSessionClient = {
  auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> };
};

export async function getOwnerReceiptUrl(
  client: OwnerSessionClient,
  invoiceId: string,
  lineItemIndex: number,
  receiptIndex: number
) {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("Please sign in again to open this receipt.");
  const response = await fetch("/api/owner/invoice-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ invoiceId, lineItemIndex, receiptIndex }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.url !== "string") {
    throw new Error(payload?.error || "Could not open the receipt. Please try again.");
  }
  const url = new URL(payload.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported receipt link.");
  return url.href;
}
