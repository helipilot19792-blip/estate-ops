import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoicePdfLineItem = {
  description?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  receipt_urls?: string[] | null;
  receipt_names?: string[] | null;
};

export type InvoicePdfInput = {
  invoiceNumber: string;
  companyName: string;
  logoUrl: string | null;
  ownerName: string;
  ownerEmail: string;
  propertyName: string;
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

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
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

export async function createInvoicePdfBuffer(input: InvoicePdfInput) {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([612, 792]);
  let y = 744;

  const ink = rgb(0.14, 0.11, 0.08);
  const muted = rgb(0.38, 0.32, 0.26);

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

  const logo = await fetchLogoBytes(input.logoUrl);
  if (logo) {
    try {
      const image = logo.contentType.includes("png")
        ? await pdfDoc.embedPng(logo.bytes)
        : await pdfDoc.embedJpg(logo.bytes);
      const scaled = image.scale(Math.min(160 / image.width, 70 / image.height, 1));
      page.drawImage(image, {
        x: 50,
        y: y - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      y -= scaled.height + 20;
    } catch {
      // Keep the PDF usable even if an uploaded logo has an unsupported encoding.
    }
  }

  drawText(input.companyName, 50, 18, { bold: true, gap: 24 });
  drawText(`Invoice ${input.invoiceNumber}`, 50, 14, { bold: true, gap: 22 });
  drawText(`Owner: ${input.ownerName} <${input.ownerEmail}>`, 50, 10, { color: muted });
  drawText(`Property: ${input.propertyName}`, 50, 10, { color: muted });
  drawText(`Issue date: ${input.issueDate}`, 50, 10, { color: muted });
  if (input.dueDate) drawText(`Due date: ${input.dueDate}`, 50, 10, { color: muted });

  if (input.headerText) {
    y -= 8;
    for (const line of wrapPdfText(input.headerText)) drawText(line, 50, 10, { color: muted });
  }

  y -= 12;
  drawText("Description", 50, 11, { bold: true, gap: 0 });
  page.drawText("Qty", { x: 370, y, size: 11, font: boldFont, color: ink });
  page.drawText("Rate", { x: 420, y, size: 11, font: boldFont, color: ink });
  page.drawText("Amount", { x: 500, y, size: 11, font: boldFont, color: ink });
  y -= 20;

  for (const item of input.lineItems) {
    addPageIfNeeded(58);
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const amount = quantity * rate;
    const description = String(item.description || "Invoice item");
    const descriptionLines = wrapPdfText(description, 48);

    page.drawText(descriptionLines[0] || description, { x: 50, y, size: 10, font: regularFont, color: ink });
    page.drawText(String(quantity), { x: 370, y, size: 10, font: regularFont, color: ink });
    page.drawText(formatCurrency(rate), { x: 420, y, size: 10, font: regularFont, color: ink });
    page.drawText(formatCurrency(amount), { x: 500, y, size: 10, font: regularFont, color: ink });
    y -= 16;

    for (const extraLine of descriptionLines.slice(1)) drawText(extraLine, 62, 9, { color: muted, gap: 13 });

    (item.receipt_urls || []).forEach((url, index) => {
      const label = item.receipt_names?.[index] || `Receipt ${index + 1}`;
      for (const line of wrapPdfText(`${label}: ${url}`, 74)) {
        drawText(line, 62, 8, { color: muted, gap: 12 });
      }
    });
  }

  y -= 10;
  drawText(`Subtotal: ${formatCurrency(input.subtotal)}`, 390, 11, { gap: 18 });
  for (const taxLine of input.taxLines) {
    if (taxLine.amount > 0 || taxLine.rate > 0) {
      drawText(`${taxLine.label || "Tax"} (${taxLine.rate}%): ${formatCurrency(taxLine.amount)}`, 390, 11, { gap: 18 });
    }
  }
  drawText(`Total: ${formatCurrency(input.total)}`, 390, 14, { bold: true, gap: 24 });

  if (input.notes) {
    drawText("Notes", 50, 11, { bold: true, gap: 16 });
    for (const line of wrapPdfText(input.notes)) drawText(line, 50, 10, { color: muted });
  }

  if (input.paymentInstructions) {
    drawText("Payment", 50, 11, { bold: true, gap: 16 });
    for (const line of wrapPdfText(input.paymentInstructions)) drawText(line, 50, 10, { color: muted });
  }

  return Buffer.from(await pdfDoc.save());
}
