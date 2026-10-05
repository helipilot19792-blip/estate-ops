import { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode, type CurrencyCode } from "./currency";

type InvoiceBalanceRow = {
  status: string;
  invoice_number: string;
  document_kind?: string | null;
  currency_code?: string | null;
  total: number | string | null;
};

export function getUnpaidInvoiceBalances(invoices: InvoiceBalanceRow[]) {
  const totalsInCents = new Map<CurrencyCode, number>();
  let invoiceCount = 0;

  for (const invoice of invoices) {
    const documentKind = invoice.document_kind ||
      (invoice.invoice_number.toUpperCase().startsWith("STMT-") ? "statement" :
        invoice.invoice_number.toUpperCase().startsWith("QUO-") ? "quote" : "invoice");
    if (invoice.status !== "sent" || documentKind !== "invoice") continue;

    const currency = normalizeCurrencyCode(invoice.currency_code);
    const amount = Number(invoice.total || 0);
    if (!Number.isFinite(amount)) continue;
    totalsInCents.set(currency, (totalsInCents.get(currency) || 0) + Math.round(amount * 100));
    invoiceCount += 1;
  }

  if (totalsInCents.size === 0) totalsInCents.set(DEFAULT_CURRENCY_CODE, 0);

  return {
    invoiceCount,
    balances: Array.from(totalsInCents, ([currency, cents]) => ({ currency, total: cents / 100 }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
