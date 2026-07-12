import { NextRequest, NextResponse } from "next/server";
import { getAiCopilotBearerToken, requireAiCopilotAccess } from "@/lib/server/ai-copilot-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QuoteLineInput = {
  description?: string | null;
  pricing_mode?: "flat_rate" | "hourly" | "percent_revenue" | null;
  quantity?: number | string | null;
  rate?: number | string | null;
  estimated_hours?: number | string | null;
  revenue_percent?: number | string | null;
  revenue_basis?: string | null;
  service_scope?: string | null;
  included?: boolean | null;
};

type QuoteDraftInput = {
  propertyName?: string | null;
  address?: string | null;
  propertyType?: string | null;
  squareFootage?: string | null;
  floors?: string | null;
  bedrooms?: string | null;
  bathrooms?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  notes?: string | null;
  services?: QuoteLineInput[] | null;
};

type SuggestedQuoteLine = {
  description: string;
  category: "other";
  quantity: number;
  rate: number;
  pricing_mode: "flat_rate" | "hourly" | "percent_revenue";
  estimated_hours?: number | null;
  revenue_percent?: number | null;
  revenue_basis?: string | null;
  service_scope?: string | null;
  taxable: boolean;
  included: boolean;
};

type QuoteAiResponse = {
  ok: true;
  configured: boolean;
  suggestions: {
    services: SuggestedQuoteLine[];
    notesDraft: string;
    missingDetails: string[];
    pricingAdvice: string[];
    readinessSummary: string;
  };
};

function normalizeText(value: unknown, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizeQuoteDraft(value: unknown): QuoteDraftInput {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    propertyName: normalizeText(raw.propertyName),
    address: normalizeText(raw.address),
    propertyType: normalizeText(raw.propertyType),
    squareFootage: normalizeText(raw.squareFootage),
    floors: normalizeText(raw.floors, 40),
    bedrooms: normalizeText(raw.bedrooms, 40),
    bathrooms: normalizeText(raw.bathrooms, 40),
    ownerName: normalizeText(raw.ownerName),
    ownerEmail: normalizeText(raw.ownerEmail),
    ownerPhone: normalizeText(raw.ownerPhone),
    notes: normalizeText(raw.notes, 2000),
    services: Array.isArray(raw.services) ? (raw.services as QuoteLineInput[]) : [],
  };
}

function parseCount(value: string | null | undefined) {
  const match = String(value || "").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function parseSquareFootage(value: string | null | undefined) {
  const numeric = String(value || "").replace(/[^0-9.]/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferEstimatedCleaningHours(quote: QuoteDraftInput) {
  const bedrooms = parseCount(quote.bedrooms);
  const bathrooms = parseCount(quote.bathrooms);
  const floors = Math.max(parseCount(quote.floors), 1);
  const squareFootage = parseSquareFootage(quote.squareFootage);
  let estimate = 2;
  estimate += bedrooms * 0.6;
  estimate += bathrooms * 0.45;
  estimate += Math.max(0, floors - 1) * 0.5;
  if (squareFootage > 0) estimate += squareFootage / 1200;
  return Math.max(2, Math.round(estimate * 4) / 4);
}

function buildFallbackSuggestions(quote: QuoteDraftInput): QuoteAiResponse["suggestions"] {
  const propertyType = String(quote.propertyType || "").toLowerCase();
  const existingServices = (quote.services || []).filter((service) => normalizeText(service.description).length > 0);
  const looksRevenueManaged =
    /airbnb|vrbo|booking|short.?term|rental|revenue|management|listing|cottage|vacation/i.test(
      [quote.propertyName, quote.notes, quote.propertyType].filter(Boolean).join(" ")
    );
  const cleaningHours = inferEstimatedCleaningHours(quote);
  const services: SuggestedQuoteLine[] = [];

  if (existingServices.length === 0) {
    services.push({
      description: "Cleaning service",
      category: "other",
      quantity: 1,
      rate: 45,
      pricing_mode: "hourly",
      estimated_hours: cleaningHours,
      service_scope: "General cleaning of kitchen, bathrooms, floors, surfaces, and reset of main living areas.",
      taxable: true,
      included: true,
    });

    if (looksRevenueManaged) {
      services.push({
        description: "Property management service",
        category: "other",
        quantity: 1,
        rate: 0,
        pricing_mode: "percent_revenue",
        revenue_percent: 12,
        revenue_basis: "of gross booking revenue",
        service_scope: "Guest communication, booking coordination, issue response, and turnover oversight.",
        taxable: true,
        included: true,
      });
    } else {
      services.push({
        description: "Property care coordination",
        category: "other",
        quantity: 1,
        rate: 180,
        pricing_mode: "flat_rate",
        service_scope: "Coordination of routine care, site checks, and basic vendor follow-up.",
        taxable: true,
        included: true,
      });
    }

    if (/house|cottage|townhouse|detached|semi/i.test(propertyType) || parseCount(quote.floors) > 1) {
      services.push({
        description: "Exterior or grounds maintenance",
        category: "other",
        quantity: 1,
        rate: 150,
        pricing_mode: "flat_rate",
        service_scope: "Seasonal yard, outdoor, or curb-appeal maintenance as scheduled.",
        taxable: true,
        included: true,
      });
    }
  }

  const missingDetails: string[] = [];
  if (!quote.ownerName) missingDetails.push("Owner or prospect name is still missing.");
  if (!quote.address) missingDetails.push("Street address is missing.");
  if (!quote.propertyType) missingDetails.push("Property type is missing.");
  if (!quote.bedrooms) missingDetails.push("Bedroom count would help scope the quote.");
  if (!quote.bathrooms) missingDetails.push("Bathroom count would help scope the quote.");
  if (existingServices.length === 0) missingDetails.push("No service lines have been confirmed yet.");

  const pricingAdvice = [
    "Use hourly pricing when cleaning scope may vary after inspection.",
    looksRevenueManaged
      ? "For management, state whether the percentage is based on gross booking revenue before taxes and platform fees."
      : "Use flat-rate pricing when the scope is predictable and you want a cleaner client experience.",
    "Add exclusions for deep cleans, emergency callouts, supplies, and after-hours work if they are not included.",
  ];

  const notesDraft = [
    "This quote is based on the information available at the time of preparation and may be adjusted if site conditions or service scope change after inspection.",
    services.some((item) => item.pricing_mode === "hourly")
      ? "Hourly services are estimates and final billing may vary with actual time required."
      : "",
    services.some((item) => item.pricing_mode === "percent_revenue")
      ? "Percentage-based services apply to the agreed revenue basis and should be reconciled against actual booking revenue."
      : "",
    "This quote is valid for 30 days unless otherwise agreed in writing.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const readinessSummary =
    missingDetails.length === 0
      ? "The quote has enough detail for a professional first draft."
      : "The quote can be sent, but a few details are still missing or should be confirmed.";

  return {
    services,
    notesDraft,
    missingDetails,
    pricingAdvice,
    readinessSummary,
  };
}

function extractOutputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

function parseSuggestionJson(text: string) {
  const match = text.match(/\{[\s\S]*\}$/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Partial<QuoteAiResponse["suggestions"]>;
  } catch {
    return null;
  }
}

async function buildAiSuggestions(quote: QuoteDraftInput) {
  const fallback = buildFallbackSuggestions(quote);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { configured: false, suggestions: fallback };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_HELP_MODEL || "gpt-5-mini",
        instructions:
          "You are assisting an admin drafting a property service quote. Return JSON only. Be practical and conservative. Suggest professional services, pricing models, quote notes, and missing details. Never mention AI. Use plain business language.",
        input: `Return JSON with keys services, notesDraft, missingDetails, pricingAdvice, readinessSummary.

Quote draft:
${JSON.stringify(quote, null, 2)}

Rules:
- services must be an array of objects with description, category, quantity, rate, pricing_mode, estimated_hours, revenue_percent, revenue_basis, service_scope, taxable, included.
- category must always be "other".
- pricing_mode must be one of "flat_rate", "hourly", "percent_revenue".
- Keep services to 2-4 items.
- notesDraft should be concise and ready to paste into the quote notes field.
- missingDetails should be short bullet-style strings.
- pricingAdvice should be short practical strings.
- readinessSummary should be one short sentence.
- If information is incomplete, still make useful assumptions and call them out in notesDraft or missingDetails.`,
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) return { configured: true, suggestions: fallback };
    const parsed = parseSuggestionJson(extractOutputText(data));
    if (!parsed) return { configured: true, suggestions: fallback };
    const normalizedServices: SuggestedQuoteLine[] =
      Array.isArray(parsed.services) && parsed.services.length > 0
        ? parsed.services.map((service): SuggestedQuoteLine => ({
            description: normalizeText(service.description, 120) || "Suggested service",
            category: "other",
            quantity: Math.max(1, Number(service.quantity || 1)),
            rate: Math.max(0, Number(service.rate || 0)),
            pricing_mode:
              service.pricing_mode === "hourly" || service.pricing_mode === "percent_revenue"
                ? service.pricing_mode
                : "flat_rate",
            estimated_hours: service.estimated_hours ? Number(service.estimated_hours) : null,
            revenue_percent: service.revenue_percent ? Number(service.revenue_percent) : null,
            revenue_basis: normalizeText(service.revenue_basis, 120) || null,
            service_scope: normalizeText(service.service_scope, 240) || null,
            taxable: service.taxable !== false,
            included: service.included !== false,
          }))
        : fallback.services;

    return {
      configured: true,
      suggestions: {
        services: normalizedServices,
        notesDraft: normalizeText(parsed.notesDraft, 1800) || fallback.notesDraft,
        missingDetails:
          Array.isArray(parsed.missingDetails) && parsed.missingDetails.length > 0
            ? parsed.missingDetails.map((item) => normalizeText(item, 160)).filter(Boolean)
            : fallback.missingDetails,
        pricingAdvice:
          Array.isArray(parsed.pricingAdvice) && parsed.pricingAdvice.length > 0
            ? parsed.pricingAdvice.map((item) => normalizeText(item, 180)).filter(Boolean)
            : fallback.pricingAdvice,
        readinessSummary: normalizeText(parsed.readinessSummary, 220) || fallback.readinessSummary,
      },
    };
  } catch {
    return { configured: true, suggestions: fallback };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = normalizeText(body?.organizationId, 80);
    const token = getAiCopilotBearerToken(request);

    await requireAiCopilotAccess({ token, organizationId });

    const quote = normalizeQuoteDraft(body?.quote);
    const result = await buildAiSuggestions(quote);

    return NextResponse.json({
      ok: true,
      configured: result.configured,
      suggestions: result.suggestions,
    } satisfies QuoteAiResponse);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The quote AI helper could not respond right now.",
      },
      { status: 500 }
    );
  }
}
