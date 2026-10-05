import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Compile the two small modules in memory so Node can load the app's extensionless import.
const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 })).toString("base64")}`;
const currencyUrl = moduleUrl(readFileSync(new URL("../lib/currency.ts", import.meta.url), "utf8"));
const balanceSource = readFileSync(new URL("../lib/invoice-balances.ts", import.meta.url), "utf8").replace('"./currency"', JSON.stringify(currencyUrl));
const { getUnpaidInvoiceBalances } = await import(moduleUrl(balanceSource));
const { DEFAULT_CURRENCY_CODE, normalizeCurrencyCode } = await import(currencyUrl);

assert.equal(DEFAULT_CURRENCY_CODE, "CAD");
assert.equal(normalizeCurrencyCode(null), "CAD");
assert.equal(normalizeCurrencyCode("USD"), "USD", "saved USD preferences remain supported");

const invoice = (overrides = {}) => ({ status: "sent", invoice_number: "INV-1", total: 100, currency_code: "CAD", ...overrides });
assert.deepEqual(getUnpaidInvoiceBalances([]), { invoiceCount: 0, balances: [{ currency: "CAD", total: 0 }] });
assert.deepEqual(getUnpaidInvoiceBalances([
  invoice({ total: "113.00" }),
  invoice({ total: 0.1 }),
  invoice({ total: 0.2 }),
  invoice({ total: 15, currency_code: null }),
  invoice({ total: 50, currency_code: "USD" }),
  invoice({ status: "paid" }),
  invoice({ status: "void" }),
  invoice({ status: "draft" }),
  invoice({ document_kind: "quote" }),
  invoice({ invoice_number: "QUO-2" }),
  invoice({ document_kind: "statement" }),
  invoice({ invoice_number: "STMT-2" }),
]), {
  invoiceCount: 5,
  balances: [{ currency: "CAD", total: 128.3 }, { currency: "USD", total: 50 }],
});
assert.deepEqual(getUnpaidInvoiceBalances([
  invoice({ total: 25 }),
  invoice({ total: -5 }),
]), { invoiceCount: 2, balances: [{ currency: "CAD", total: 20 }] });

console.log("invoice balance tests passed");
