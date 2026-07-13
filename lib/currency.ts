export type CurrencyCode = "USD" | "CAD";

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "USD";
export const SUPPORTED_CURRENCY_CODES: CurrencyCode[] = ["USD", "CAD"];

export function normalizeCurrencyCode(value: unknown, fallback: CurrencyCode = DEFAULT_CURRENCY_CODE): CurrencyCode {
  const code = String(value || "").trim().toUpperCase();
  return SUPPORTED_CURRENCY_CODES.includes(code as CurrencyCode) ? (code as CurrencyCode) : fallback;
}

export function getCurrencyLabel(code: CurrencyCode) {
  return code === "CAD" ? "Canadian dollar (CAD)" : "US dollar (USD)";
}

export function getCurrencyPrefix(code: CurrencyCode) {
  return code === "CAD" ? "CA$" : "US$";
}

export function formatCurrency(value: number | null | undefined, currencyCode: CurrencyCode = DEFAULT_CURRENCY_CODE) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${sign}${getCurrencyPrefix(currencyCode)}${formatted}`;
}
