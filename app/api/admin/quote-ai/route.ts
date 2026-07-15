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

type QuoteAiMode = "services" | "proposal" | "completeness";

type ProposalSection = {
  title: string;
  body: string;
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
  source: "openai" | "fallback";
  warning: string | null;
  suggestions: {
    services: SuggestedQuoteLine[];
    notesDraft: string;
    proposalSections: ProposalSection[];
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
        revenue_percent: 15,
        revenue_basis: "of gross booking revenue",
        service_scope: "Guest communication, listing and booking coordination, dynamic pricing, issue response, turnover oversight, and owner reporting.",
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

  const propertyLabel = normalizeText(quote.propertyName, 120) || normalizeText(quote.address, 160) || "your property";
  const location = normalizeText(quote.address, 160);
  const propertyFacts = [
    quote.propertyType,
    quote.bedrooms ? `${quote.bedrooms} bedrooms` : "",
    quote.bathrooms ? `${quote.bathrooms} bathrooms` : "",
    quote.squareFootage ? `${quote.squareFootage} sq. ft.` : "",
  ].filter(Boolean).join(", ");
  const proposalSections: ProposalSection[] = [
    {
      title: "Welcome",
      body: `Thank you for considering Estate of Mind Property Management for ${propertyLabel}${location ? ` at ${location}` : ""}. This proposal outlines a thoughtful, property-specific approach to protecting the home, supporting guests, and building a dependable operating partnership.`,
    },
    {
      title: "Our approach",
      body: `We pair attentive local property care with clear systems, responsive communication, and hospitality-minded service. The goal is not simply to manage tasks, but to create an operation that owners can trust and guests want to return to.${propertyFacts ? ` Our initial plan is based on the information provided: ${propertyFacts}.` : ""}`,
    },
    {
      title: "Property-specific plan",
      body: `For ${propertyLabel}, we recommend confirming the turnover standard, access procedures, maintenance contacts, guest capacity, and any distinctive amenities before launch. Those details will guide the final service schedule, guest information, inspection routines, and escalation plan.`,
    },
    {
      title: "Guest and owner experience",
      body: "Guests should receive timely information, a consistent arrival experience, and responsive support when something needs attention. Owners should have straightforward communication, documented follow-up, and visibility into property activity without having to manage daily details.",
    },
    {
      title: "Revenue and marketing strategy",
      body: "For short-term rentals, pricing and positioning should be reviewed continually against demand, seasonality, local events, booking pace, and property performance. Marketing should communicate what is distinctive about the home while setting accurate expectations. Any revenue forecast should be treated as a planning estimate, not a guarantee.",
    },
    {
      title: "Our commitment",
      body: "We will communicate professionally, care for the property with attention to detail, respond proactively to operational concerns, and provide clear reporting. Recommendations that change scope or cost remain subject to owner review and approval.",
    },
    {
      title: "Next steps",
      body: "Review the proposed services and investment, confirm any missing property details, and request revisions where needed. Once the scope is approved, we can finalize the service agreement, onboarding checklist, access plan, and launch schedule.",
    },
  ];

  const readinessSummary =
    missingDetails.length === 0
      ? "The quote has enough detail for a professional first draft."
      : "The quote can be sent, but a few details are still missing or should be confirmed.";

  return {
    services,
    notesDraft,
    proposalSections,
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

function getQuoteSuggestionSchema() {
  return {
    type: "object",
    properties: {
      services: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            category: { type: "string", enum: ["other"] },
            quantity: { type: "number" },
            rate: { type: "number" },
            pricing_mode: { type: "string", enum: ["flat_rate", "hourly", "percent_revenue"] },
            estimated_hours: { type: ["number", "null"] },
            revenue_percent: { type: ["number", "null"] },
            revenue_basis: { type: ["string", "null"] },
            service_scope: { type: ["string", "null"] },
            taxable: { type: "boolean" },
            included: { type: "boolean" },
          },
          required: ["description", "category", "quantity", "rate", "pricing_mode", "estimated_hours", "revenue_percent", "revenue_basis", "service_scope", "taxable", "included"],
          additionalProperties: false,
        },
      },
      notesDraft: { type: "string" },
      proposalSections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["title", "body"],
          additionalProperties: false,
        },
      },
      missingDetails: { type: "array", items: { type: "string" } },
      pricingAdvice: { type: "array", items: { type: "string" } },
      readinessSummary: { type: "string" },
    },
    required: ["services", "notesDraft", "proposalSections", "missingDetails", "pricingAdvice", "readinessSummary"],
    additionalProperties: false,
  };
}

async function buildAiSuggestions(quote: QuoteDraftInput, mode: QuoteAiMode) {
  const fallback = buildFallbackSuggestions(quote);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { configured: false, source: "fallback" as const, warning: null, suggestions: fallback };

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
          "You are a senior property-management proposal writer for Estate of Mind Property Management. Create a warm, premium, property-specific partnership proposal. Be practical, conservative, and transparent. Never invent property features, inspection findings, revenue forecasts, or guarantees. Mark missing facts for confirmation. Never mention AI. Use polished Canadian business English.",
        input: `The admin requested the ${mode} view. Return a complete suggestion package with services, commercial notes, proposal sections, missing details, pricing advice, and readiness summary.

Quote draft:
${JSON.stringify(quote, null, 2)}

Rules:
- services must be an array of objects with description, category, quantity, rate, pricing_mode, estimated_hours, revenue_percent, revenue_basis, service_scope, taxable, included.
- category must always be "other".
- pricing_mode must be one of "flat_rate", "hourly", "percent_revenue".
- Keep services to 2-5 items. Preserve existing confirmed services and pricing where supplied.
- notesDraft should be concise and ready to paste into the quote notes field.
- proposalSections should contain 6-8 concise sections suitable for a polished partnership proposal. Use the general flow Welcome, Our approach, Property-specific plan, Guest and owner experience, Revenue and marketing strategy, Our commitment, and Next steps. Tailor every section to known facts and clearly label assumptions.
- missingDetails should be short bullet-style strings.
- pricingAdvice should be short practical strings.
- readinessSummary should be one short sentence.
- If information is incomplete, still produce a useful draft but call assumptions out in notesDraft or missingDetails.
- Suggestions never authorize an action; an admin will review and explicitly apply them.`,
        text: {
          format: {
            type: "json_schema",
            name: "property_quote_proposal",
            strict: true,
            schema: getQuoteSuggestionSchema(),
          },
        },
      }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) return { configured: true, source: "fallback" as const, warning: "OpenAI was unavailable, so these are conservative local suggestions.", suggestions: fallback };
    const parsed = parseSuggestionJson(extractOutputText(data));
    if (!parsed) return { configured: true, source: "fallback" as const, warning: "OpenAI returned an unusable draft, so these are conservative local suggestions.", suggestions: fallback };
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
      source: "openai" as const,
      warning: null,
      suggestions: {
        services: normalizedServices,
        notesDraft: normalizeText(parsed.notesDraft, 4000) || fallback.notesDraft,
        proposalSections:
          Array.isArray(parsed.proposalSections) && parsed.proposalSections.length > 0
            ? parsed.proposalSections
                .map((section) => ({
                  title: normalizeText(section.title, 80),
                  body: normalizeText(section.body, 1400),
                }))
                .filter((section) => section.title && section.body)
                .slice(0, 8)
            : fallback.proposalSections,
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
    return { configured: true, source: "fallback" as const, warning: "OpenAI could not be reached, so these are conservative local suggestions.", suggestions: fallback };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = normalizeText(body?.organizationId, 80);
    const token = getAiCopilotBearerToken(request);

    await requireAiCopilotAccess({ token, organizationId });

    const quote = normalizeQuoteDraft(body?.quote);
    const mode: QuoteAiMode = body?.mode === "services" || body?.mode === "completeness" ? body.mode : "proposal";
    const result = await buildAiSuggestions(quote, mode);

    return NextResponse.json({
      ok: true,
      configured: result.configured,
      source: result.source,
      warning: result.warning,
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
