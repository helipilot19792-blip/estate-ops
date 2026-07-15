import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEFAULT_CURRENCY_CODE, formatCurrency as formatDocumentCurrency, normalizeCurrencyCode, type CurrencyCode } from "../currency";

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
  if (Number(item.rate || 0) === 0 && item.included !== false) return "Included";
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
  if (Number(item.rate || 0) === 0 && item.included !== false) return "Included";
  return formatCurrency(Number(item.quantity || 0) * Number(item.rate || 0), currencyCode);
}

function parseProposalSections(notes: string | null) {
  const lines = String(notes || "").split(/\r?\n/);
  const sections: Array<{ title: string; body: string }> = [];
  let title = "Proposal notes";
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n").trim();
    if (text) sections.push({ title, body: text });
    body = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^[A-Z][A-Z0-9 &/–—'-]{2,70}$/.test(line) && line.length <= 70) {
      flush();
      title = line.replace(/\s+/g, " ");
    } else {
      body.push(rawLine);
    }
  }
  flush();
  return sections;
}

async function createQuoteProposalPdfBuffer(input: InvoicePdfInput, currencyCode: CurrencyCode) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const navy = rgb(0.06, 0.19, 0.31);
  const gold = rgb(0.73, 0.54, 0.20);
  const ink = rgb(0.10, 0.12, 0.15);
  const muted = rgb(0.34, 0.39, 0.44);
  const cream = rgb(0.98, 0.97, 0.94);
  const paleBlue = rgb(0.95, 0.97, 0.98);
  const pageLeft = 58;
  const pageRight = 554;
  const contentWidth = pageRight - pageLeft;
  let page = pdfDoc.addPage([612, 792]);
  let pageNumber = 1;
  let y = 730;

  function wrapByWidth(value: string, font: typeof regularFont, size: number, maxWidth: number) {
    const paragraphs = value.split(/\r?\n/);
    const result: string[] = [];
    for (const paragraph of paragraphs) {
      const words = paragraph.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
      if (words.length === 0) {
        result.push("");
        continue;
      }
      let current = words[0];
      for (const word of words.slice(1)) {
        const candidate = `${current} ${word}`;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
          result.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      result.push(current);
    }
    return result;
  }

  function drawFooter() {
    page.drawLine({ start: { x: pageLeft, y: 42 }, end: { x: pageRight, y: 42 }, thickness: 0.7, color: gold });
    page.drawText(input.companyName, { x: pageLeft, y: 25, size: 7.5, font: regularFont, color: muted });
    page.drawText(String(pageNumber), { x: pageRight - 5, y: 25, size: 8, font: boldFont, color: navy });
  }

  function startContentPage(sectionLabel?: string) {
    if (pageNumber > 1) drawFooter();
    page = pdfDoc.addPage([612, 792]);
    pageNumber += 1;
    y = 730;
    page.drawText(input.companyName.toUpperCase(), { x: pageLeft, y: 754, size: 7.5, font: boldFont, color: gold });
    if (sectionLabel) page.drawText(sectionLabel, { x: pageRight - boldFont.widthOfTextAtSize(sectionLabel, 7.5) - 4, y: 754, size: 7.5, font: boldFont, color: muted });
  }

  function ensureSpace(height: number, sectionLabel?: string) {
    if (y - height >= 62) return;
    startContentPage(sectionLabel);
  }

  function drawHeading(title: string, subtitle?: string) {
    ensureSpace(subtitle ? 78 : 54, "PROPOSAL");
    page.drawText(title.toUpperCase(), { x: pageLeft, y, size: 24, font: boldFont, color: navy });
    y -= 12;
    page.drawLine({ start: { x: pageLeft, y }, end: { x: pageLeft + 58, y }, thickness: 2, color: gold });
    y -= 22;
    if (subtitle) {
      for (const line of wrapByWidth(subtitle, regularFont, 11, contentWidth)) {
        page.drawText(line, { x: pageLeft, y, size: 11, font: regularFont, color: muted });
        y -= 16;
      }
      y -= 5;
    }
  }

  function drawBody(value: string, options?: { bullet?: boolean }) {
    const lines = wrapByWidth(value, regularFont, 10.5, options?.bullet ? contentWidth - 20 : contentWidth);
    ensureSpace(lines.length * 15 + 8, "PROPOSAL");
    for (const line of lines) {
      if (!line) {
        y -= 8;
        continue;
      }
      if (options?.bullet) page.drawCircle({ x: pageLeft + 3, y: y + 3, size: 1.8, color: gold });
      page.drawText(line, { x: options?.bullet ? pageLeft + 16 : pageLeft, y, size: 10.5, font: regularFont, color: ink });
      y -= 15;
    }
    y -= 7;
  }

  const logo = await fetchLogoBytes(input.logoUrl);
  if (logo) {
    try {
      const image = logo.contentType.includes("png") ? await pdfDoc.embedPng(logo.bytes) : await pdfDoc.embedJpg(logo.bytes);
      const scaled = image.scale(Math.min(250 / image.width, 95 / image.height, 2));
      page.drawImage(image, { x: (612 - scaled.width) / 2, y: 660, width: scaled.width, height: scaled.height });
    } catch {
      // The proposal remains fully usable when an uploaded logo cannot be embedded.
    }
  } else {
    page.drawText(input.companyName.toUpperCase(), {
      x: (612 - boldFont.widthOfTextAtSize(input.companyName.toUpperCase(), 14)) / 2,
      y: 700,
      size: 14,
      font: boldFont,
      color: gold,
    });
  }

  page.drawText("THE ESTATE OF MIND EXPERIENCE", {
    x: (612 - boldFont.widthOfTextAtSize("THE ESTATE OF MIND EXPERIENCE", 23)) / 2,
    y: 580,
    size: 23,
    font: boldFont,
    color: navy,
  });
  page.drawText("PROPERTY MANAGEMENT PARTNERSHIP PROPOSAL", {
    x: (612 - boldFont.widthOfTextAtSize("PROPERTY MANAGEMENT PARTNERSHIP PROPOSAL", 12)) / 2,
    y: 548,
    size: 12,
    font: boldFont,
    color: ink,
  });
  page.drawLine({ start: { x: 94, y: 515 }, end: { x: 518, y: 515 }, thickness: 1.4, color: gold });
  page.drawText("PREPARED EXCLUSIVELY FOR", { x: 94, y: 477, size: 8, font: boldFont, color: gold });
  const ownerLines = wrapByWidth(input.ownerName || "Prospective owner", boldFont, 20, 424).slice(0, 3);
  ownerLines.forEach((line, index) => page.drawText(line, { x: 94, y: 444 - index * 24, size: 20, font: boldFont, color: navy }));
  const propertyY = 444 - ownerLines.length * 24 - 4;
  page.drawText(input.propertyName || input.propertySnapshot?.address || "Property partnership", { x: 94, y: propertyY, size: 13, font: boldFont, color: ink });
  if (input.propertySnapshot?.address) page.drawText(input.propertySnapshot.address, { x: 94, y: propertyY - 20, size: 11, font: regularFont, color: muted });
  page.drawRectangle({ x: 94, y: 274, width: 424, height: 90, color: paleBlue, borderColor: gold, borderWidth: 0.7 });
  const facts = [
    input.propertySnapshot?.property_type,
    input.propertySnapshot?.bedrooms ? `${input.propertySnapshot.bedrooms} bedrooms` : "",
    input.propertySnapshot?.bathrooms ? `${input.propertySnapshot.bathrooms} bathrooms` : "",
    input.propertySnapshot?.square_footage ? `${input.propertySnapshot.square_footage} sq. ft.` : "",
  ].filter(Boolean);
  page.drawText("PROPERTY OVERVIEW", { x: 112, y: 337, size: 8, font: boldFont, color: gold });
  const factText = facts.length > 0 ? facts.join("  •  ") : "Property details to be confirmed during onboarding";
  for (const [index, line] of wrapByWidth(factText, regularFont, 11, 388).entries()) {
    page.drawText(line, { x: 112, y: 310 - index * 17, size: 11, font: regularFont, color: ink });
  }
  page.drawText(`Proposal ${input.invoiceNumber}  •  Prepared ${input.issueDate}${input.dueDate ? `  •  Valid through ${input.dueDate}` : ""}`, { x: 94, y: 234, size: 9, font: regularFont, color: muted });
  page.drawText("Creating Experiences Worth Returning To", {
    x: (612 - italicFont.widthOfTextAtSize("Creating Experiences Worth Returning To", 11)) / 2,
    y: 86,
    size: 11,
    font: italicFont,
    color: navy,
  });
  drawFooter();

  startContentPage("SCOPE & INVESTMENT");
  drawHeading("Proposed partnership", input.headerText || "A clear starting scope, tailored to the property information currently available.");
  page.drawText("RECOMMENDED SERVICES", { x: pageLeft, y, size: 10, font: boldFont, color: gold });
  y -= 24;
  const visibleItems = input.lineItems.filter((item) => item.included !== false);
  for (const item of visibleItems) {
    const scopeLines = item.service_scope ? wrapByWidth(item.service_scope, regularFont, 9, contentWidth - 28) : [];
    const cardHeight = Math.max(62, 48 + scopeLines.length * 13);
    ensureSpace(cardHeight + 12, "SCOPE & INVESTMENT");
    page.drawRectangle({ x: pageLeft, y: y - cardHeight + 14, width: contentWidth, height: cardHeight, color: cream });
    page.drawRectangle({ x: pageLeft, y: y - cardHeight + 14, width: 4, height: cardHeight, color: gold });
    const description = String(item.description || "Proposed service");
    page.drawText(description, { x: pageLeft + 18, y, size: 12, font: boldFont, color: navy });
    const rateLabel = getQuoteRateLabel(item, currencyCode);
    const amountLabel = getQuoteAmountLabel(item, currencyCode);
    const investment = rateLabel === amountLabel ? rateLabel : `${rateLabel}  •  ${amountLabel}`;
    page.drawText(investment, { x: pageRight - boldFont.widthOfTextAtSize(investment, 9), y, size: 9, font: boldFont, color: navy });
    let scopeY = y - 22;
    for (const line of scopeLines) {
      page.drawText(line, { x: pageLeft + 18, y: scopeY, size: 9, font: regularFont, color: muted });
      scopeY -= 13;
    }
    if (item.pricing_mode === "percent_revenue" && item.revenue_basis) {
      const basis = `Basis: ${item.revenue_basis}`;
      page.drawText(basis, { x: pageLeft + 18, y: scopeY, size: 8.5, font: italicFont, color: muted });
    }
    y -= cardHeight + 12;
  }

  ensureSpace(95, "SCOPE & INVESTMENT");
  y -= 2;
  page.drawLine({ start: { x: pageLeft, y }, end: { x: pageRight, y }, thickness: 0.8, color: gold });
  y -= 26;
  page.drawText("ESTIMATED INVESTMENT", { x: pageLeft, y, size: 10, font: boldFont, color: gold });
  const hasPercentagePricing = visibleItems.some((item) => item.pricing_mode === "percent_revenue");
  const percentageItems = visibleItems.filter((item) => item.pricing_mode === "percent_revenue");
  const uniquePercentages = Array.from(new Set(percentageItems.map((item) => Number(item.revenue_percent || 0)).filter((value) => value > 0)));
  const investmentTotal = input.total > 0
    ? formatCurrency(input.total, currencyCode)
    : hasPercentagePricing && uniquePercentages.length === 1
      ? `${uniquePercentages[0]}% OF REVENUE`
      : hasPercentagePricing
        ? "VARIABLE"
        : "TO BE CONFIRMED";
  page.drawText(investmentTotal, { x: pageRight - boldFont.widthOfTextAtSize(investmentTotal, 21), y: y - 4, size: 21, font: boldFont, color: navy });
  y -= 22;
  page.drawText("Flat and hourly estimates are summarized above; percentage-based fees vary with the agreed revenue basis.", { x: pageLeft, y, size: 8.5, font: regularFont, color: muted });

  const sections = parseProposalSections(input.notes);
  for (const section of sections) {
    startContentPage(section.title.toUpperCase());
    drawHeading(section.title);
    const paragraphs = section.body.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const bulletLines = paragraph.split(/\n/).map((value) => value.trim()).filter(Boolean);
      if (bulletLines.length > 1 && bulletLines.every((value) => /^[-•*]/.test(value))) {
        for (const bullet of bulletLines) drawBody(bullet.replace(/^[-•*]\s*/, ""), { bullet: true });
      } else {
        drawBody(paragraph);
      }
    }
  }

  if (pageNumber > 1) drawFooter();
  return Buffer.from(await pdfDoc.save());
}

export async function createInvoicePdfBuffer(input: InvoicePdfInput) {
  const currencyCode = normalizeCurrencyCode(input.currencyCode, DEFAULT_CURRENCY_CODE);
  if (["quote"].includes(String(input.documentKind))) return createQuoteProposalPdfBuffer(input, currencyCode);
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
