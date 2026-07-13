import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEFAULT_CURRENCY_CODE, formatCurrency as formatDocumentCurrency, normalizeCurrencyCode, type CurrencyCode } from "@/lib/currency";

export type InvoicePdfLineItem = {
  description?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  pricing_mode?: "flat_rate" | "hourly" | "percent_revenue";
  service_scope?: string | null;
  included?: boolean;
  estimated_hours?: number | string | null;
  revenue_percent?: number | string | null;
  revenue_basis?: string | null;
  revenue_estimate?: number | string | null;
  receipt_urls?: string[] | null;
  receipt_names?: string[] | null;
};

export type InvoicePdfPropertySnapshot = {
  property_name?: string | null;
  address?: string | null;
  property_type?: string | null;
  square_footage?: string | null;
  floors?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  documentKind?: "invoice" | "statement" | "quote";
  currencyCode?: CurrencyCode;
  companyName: string;
  logoUrl: string | null;
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string | null;
  propertyName: string;
  propertySnapshot?: InvoicePdfPropertySnapshot | null;
  issueDate: string;
  dueDate: string | null;
  headerText: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  subtotal: number;
  taxLines: Array<{ id?: string; label: string; rate: number; amount: number }>;
  taxTotal: number;
  total: number;
  lineItems: InvoicePdfLineItem[];
};

function formatCurrency(value: number | null | undefined, currencyCode: CurrencyCode = DEFAULT_CURRENCY_CODE) {
  return formatDocumentCurrency(value, currencyCode);
}

function wrapPdfText(value: string, maxLength = 86) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if (`${current} ${word}`.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function getReceiptLabel(item: InvoicePdfLineItem, index: number) {
  const rawName = String(item.receipt_names?.[index] || "").trim();
  if (rawName) return rawName;

  const rawUrl = String(item.receipt_urls?.[index] || "").trim();
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const lastPathPart = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      if (lastPathPart) return lastPathPart;
    } catch {
      const lastPathPart = rawUrl.split(/[\\/]/).filter(Boolean).pop();
      if (lastPathPart) return lastPathPart;
    }
  }

  return `Receipt ${index + 1}`;
}

async function fetchLogoBytes(logoUrl: string | null) {
  if (!logoUrl) return null;

  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, contentType };
  } catch {
    return null;
  }
}

function getDocumentLabel(documentKind: InvoicePdfInput["documentKind"]) {
  if (documentKind === "statement") return "Statement";
  if (documentKind === "quote") return "Quote";
  return "Invoice";
}

function getQuoteRateLabel(item: InvoicePdfLineItem, currencyCode: CurrencyCode) {
  const pricingMode = item.pricing_mode || "flat_rate";
  if (pricingMode === "hourly") {
    return `${formatCurrency(Number(item.rate || 0), currencyCode)}/hr`;
  }
  if (pricingMode === "percent_revenue") {
    const percent = Number(item.revenue_percent || 0);
    return percent > 0 ? `${percent}%` : "Variable";
  }
  return formatCurrency(Number(item.rate || 0), currencyCode);
}

function getQuoteAmountLabel(item: InvoicePdfLineItem, currencyCode: CurrencyCode) {
  const pricingMode = item.pricing_mode || "flat_rate";
  if (pricingMode === "hourly") {
    const hours = Number(item.estimated_hours || item.quantity || 0);
    const amount = Number(item.rate || 0) * hours;
    return hours > 0 ? `${formatCurrency(amount, currencyCode)} est.` : "Estimate";
  }
  if (pricingMode === "percent_revenue") {
    const basis = String(item.revenue_basis || "of revenue").trim();
    const estimate = Number(item.revenue_estimate || 0);
    return estimate > 0 ? `${formatCurrency(estimate, currencyCode)} est.` : basis;
  }
  return formatCurrency(Number(item.quantity || 0) * Number(item.rate || 0), currencyCode);
}

export async function createInvoicePdfBuffer(input: InvoicePdfInput) {
  const currencyCode = normalizeCurrencyCode(input.currencyCode, DEFAULT_CURRENCY_CODE);
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([612, 792]);
  let y = 744;

  const ink = rgb(0.14, 0.11, 0.08);
  const muted = rgb(0.38, 0.32, 0.26);
  const rule = rgb(0.86, 0.80, 0.70);
  const pageLeft = 50;
  const pageRight = 562;
  const columnQty = 370;
  const columnRate = 420;
  const columnAmount = 500;
  const documentLabel = getDocumentLabel(input.documentKind);

  function addPageIfNeeded(gap = 24) {
    if (y > 56 + gap) return;
    page = pdfDoc.addPage([612, 792]);
    y = 744;
  }

  function drawText(text: string, x: number, size = 10, options?: { bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number }) {
    addPageIfNeeded(options?.gap ?? 16);
    page.drawText(text, {
      x,
      y,
      size,
      font: options?.bold ? boldFont : regularFont,
      color: options?.color || ink,
    });
    y -= options?.gap ?? size + 6;
  }

  function drawRule(gap = 18) {
    addPageIfNeeded(gap);
    page.drawLine({
      start: { x: pageLeft, y },
      end: { x: pageRight, y },
      thickness: 1,
      color: rule,
    });
    y -= gap;
  }

  const logo = await fetchLogoBytes(input.logoUrl);
  if (logo) {
    try {
      const image = logo.contentType.includes("png")
        ? await pdfDoc.embedPng(logo.bytes)
        : await pdfDoc.embedJpg(logo.bytes);
      const scaled = image.scale(Math.min(360 / image.width, 150 / image.height, 2));
      page.drawImage(image, {
        x: pageLeft + ((pageRight - pageLeft) - scaled.width) / 2,
        y: y - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      y -= scaled.height + 28;
    } catch {
      // Keep the PDF usable even if an uploaded logo has an unsupported encoding.
    }
  }

  drawText(input.companyName, pageLeft, 22, { bold: true, gap: 28 });
  drawText(`${documentLabel} ${input.invoiceNumber}`, pageLeft, 16, { bold: true, gap: 24 });
  const contactLine = [input.ownerName, input.ownerEmail ? `<${input.ownerEmail}>` : "", input.ownerPhone || ""]
    .filter(Boolean)
    .join(" ");
  drawText(`${input.documentKind === "quote" ? "Contact" : "Owner"}: ${contactLine || input.ownerName}`, pageLeft, 10.5, { color: muted, gap: 15 });
  drawText(`Property: ${input.propertyName}`, pageLeft, 10.5, { color: muted, gap: 15 });
  drawText(`Issue date: ${input.issueDate}`, pageLeft, 10.5, { color: muted, gap: 15 });
  if (input.dueDate) drawText(`${input.documentKind === "quote" ? "Valid through" : "Due date"}: ${input.dueDate}`, pageLeft, 10.5, { color: muted, gap: 15 });

  if (input.documentKind === "quote" && input.propertySnapshot) {
    const detailLines = [
      input.propertySnapshot.address ? `Address: ${input.propertySnapshot.address}` : "",
      input.propertySnapshot.property_type ? `Type: ${input.propertySnapshot.property_type}` : "",
      input.propertySnapshot.square_footage ? `Size: ${input.propertySnapshot.square_footage}` : "",
      input.propertySnapshot.floors ? `Floors: ${input.propertySnapshot.floors}` : "",
      input.propertySnapshot.bedrooms ? `Bedrooms: ${input.propertySnapshot.bedrooms}` : "",
      input.propertySnapshot.bathrooms ? `Bathrooms: ${input.propertySnapshot.bathrooms}` : "",
    ].filter(Boolean);

    if (detailLines.length > 0) {
      y -= 4;
      drawText("Property details", pageLeft, 11.5, { bold: true, gap: 17 });
      for (const line of detailLines) drawText(line, pageLeft, 10.5, { color: muted, gap: 15 });
    }
  }

  if (input.headerText) {
    y -= 8;
    for (const line of wrapPdfText(input.headerText, 82)) drawText(line, pageLeft, 10.5, { color: muted, gap: 15 });
  }

  y -= 12;
  drawRule(16);
  drawText(input.documentKind === "quote" ? "Service" : "Description", pageLeft, 11.5, { bold: true, gap: 0 });
  page.drawText("Qty", { x: columnQty, y, size: 11.5, font: boldFont, color: ink });
  page.drawText("Rate", { x: columnRate, y, size: 11.5, font: boldFont, color: ink });
  page.drawText("Amount", { x: columnAmount, y, size: 11.5, font: boldFont, color: ink });
  y -= 22;

  for (const item of input.lineItems) {
    if (input.documentKind === "quote" && item.included === false) continue;
    addPageIfNeeded(64);
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const amount = quantity * rate;
    const description = String(item.description || `${documentLabel} item`);
    const descriptionLines = wrapPdfText(description, 46);

    page.drawText(descriptionLines[0] || description, { x: pageLeft, y, size: 10.5, font: regularFont, color: ink });
    page.drawText(String(quantity), { x: columnQty, y, size: 10.5, font: regularFont, color: ink });
    page.drawText(input.documentKind === "quote" ? getQuoteRateLabel(item, currencyCode) : formatCurrency(rate, currencyCode), { x: columnRate, y, size: 10.5, font: regularFont, color: ink });
    page.drawText(input.documentKind === "quote" ? getQuoteAmountLabel(item, currencyCode) : formatCurrency(amount, currencyCode), { x: columnAmount, y, size: 10.5, font: regularFont, color: ink });
    y -= 17;

    for (const extraLine of descriptionLines.slice(1)) drawText(extraLine, 62, 9.5, { color: muted, gap: 14 });
    if (input.documentKind === "quote" && item.service_scope) {
      for (const scopeLine of wrapPdfText(`Scope: ${item.service_scope}`, 74)) {
        drawText(scopeLine, 62, 8.5, { color: muted, gap: 12 });
      }
    }
    if (input.documentKind === "quote" && item.pricing_mode === "percent_revenue" && item.revenue_basis) {
      for (const basisLine of wrapPdfText(`Basis: ${item.revenue_basis}`, 74)) {
        drawText(basisLine, 62, 8.5, { color: muted, gap: 12 });
      }
    }

    (item.receipt_urls || []).forEach((_url, index) => {
      const label = getReceiptLabel(item, index);
      for (const line of wrapPdfText(`Receipt attached: ${label}`, 74)) {
        drawText(line, 62, 8.5, { color: muted, gap: 12 });
      }
    });
  }

  y -= 10;
  drawRule(16);
  drawText(`Subtotal: ${formatCurrency(input.subtotal, currencyCode)}`, 382, 11.5, { gap: 18 });
  for (const taxLine of input.taxLines) {
    if (taxLine.amount > 0 || taxLine.rate > 0) {
      drawText(`${taxLine.label || "Tax"} (${taxLine.rate}%): ${formatCurrency(taxLine.amount, currencyCode)}`, 382, 11.5, { gap: 18 });
    }
  }
  drawText(`Total: ${formatCurrency(input.total, currencyCode)}`, 382, 16, { bold: true, gap: 28 });

  if (input.notes) {
    drawText("Notes", pageLeft, 12, { bold: true, gap: 17 });
    for (const line of wrapPdfText(input.notes, 82)) drawText(line, pageLeft, 10.5, { color: muted, gap: 15 });
  }

  if (input.documentKind === "invoice" && input.paymentInstructions) {
    drawText("Payment", pageLeft, 12, { bold: true, gap: 17 });
    for (const line of wrapPdfText(input.paymentInstructions, 82)) drawText(line, pageLeft, 10.5, { color: muted, gap: 15 });
  }

  return Buffer.from(await pdfDoc.save());
}
