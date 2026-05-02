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
  ownerName: string;
  ownerEmail: string;
  propertyName: string;
  issueDate: string;
  dueDate: string | null;
  headerText: string | null;
  notes: string | null;
  paymentInstructions: string | null;
  total: number;
  lineItems: InvoicePdfLineItem[];
};

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

function buildPdfContentLine(text: string, x: number, y: number, size = 10) {
  return `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`;
}

export function createInvoicePdfBuffer(input: InvoicePdfInput) {
  const pages: string[] = [];
  let y = 760;
  let lines: string[] = [];

  function pushLine(text: string, size = 10, x = 50, gap = 16) {
    if (y < 60) {
      pages.push(lines.join("\n"));
      lines = [];
      y = 760;
    }

    lines.push(buildPdfContentLine(text, x, y, size));
    y -= gap;
  }

  pushLine(input.companyName, 18, 50, 24);
  pushLine(`Invoice ${input.invoiceNumber}`, 14, 50, 22);
  pushLine(`Owner: ${input.ownerName} <${input.ownerEmail}>`, 10);
  pushLine(`Property: ${input.propertyName}`, 10);
  pushLine(`Issue date: ${input.issueDate}`, 10);
  if (input.dueDate) pushLine(`Due date: ${input.dueDate}`, 10);

  if (input.headerText) {
    y -= 8;
    for (const line of wrapPdfText(input.headerText)) pushLine(line, 10);
  }

  y -= 12;
  pushLine("Description", 11, 50, 14);
  pushLine("Qty        Rate          Amount", 11, 390, 18);

  for (const item of input.lineItems) {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.rate || 0);
    const amount = quantity * rate;
    const description = String(item.description || "Invoice item");
    const descriptionLines = wrapPdfText(description, 54);

    pushLine(descriptionLines[0] || description, 10, 50, 14);
    pushLine(`${quantity}        ${formatCurrency(rate)}        ${formatCurrency(amount)}`, 10, 390, 16);

    for (const extraLine of descriptionLines.slice(1)) {
      pushLine(extraLine, 9, 62, 13);
    }

    (item.receipt_urls || []).forEach((url, index) => {
      const label = item.receipt_names?.[index] || `Receipt ${index + 1}`;
      for (const line of wrapPdfText(`${label}: ${url}`, 70)) {
        pushLine(line, 8, 62, 12);
      }
    });
  }

  y -= 10;
  pushLine(`Total: ${formatCurrency(input.total)}`, 14, 390, 24);

  if (input.notes) {
    pushLine("Notes", 11, 50, 16);
    for (const line of wrapPdfText(input.notes)) pushLine(line, 10);
  }

  if (input.paymentInstructions) {
    pushLine("Payment", 11, 50, 16);
    for (const line of wrapPdfText(input.paymentInstructions)) pushLine(line, 10);
  }

  pages.push(lines.join("\n"));

  const objects: string[] = [];
  const pageRefs: number[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const content of pages) {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = pageObjectNumber + 1;
    pageRefs.push(pageObjectNumber);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}
