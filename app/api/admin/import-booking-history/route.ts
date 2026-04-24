import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicSupabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing.");
}

if (!publicSupabaseKey) {
  throw new Error(
    "Missing public Supabase key. Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing.");
}

type BookingImportRow = {
  source: string;
  summary: string;
  checkinDate: string;
  checkoutDate: string;
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function normalizeSource(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "booking.com" || normalized === "booking") return "booking";
  return normalized || "other";
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, "0");
    const day = slashMatch[2].padStart(2, "0");
    return `${slashMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  )
    .toISOString()
    .slice(0, 10);
}

function buildImportRows(csvRows: Record<string, string>[]) {
  const results: BookingImportRow[] = [];

  for (const row of csvRows) {
    const source = normalizeSource(
      row.source || row.platform || row.channel || row.site || row["booking source"] || ""
    );
    const summary =
      row.summary ||
      row.guest ||
      row["guest name"] ||
      row.name ||
      row.reservation ||
      row.title ||
      "Imported stay";
    const checkinDate = normalizeDate(
      row.checkin ||
        row["check-in"] ||
        row.arrival ||
        row.start ||
        row.start_date ||
        row["start date"] ||
        ""
    );
    const checkoutDate = normalizeDate(
      row.checkout ||
        row["check-out"] ||
        row.departure ||
        row.end ||
        row.end_date ||
        row["end date"] ||
        ""
    );

    if (!checkinDate || !checkoutDate) continue;
    if (checkoutDate <= checkinDate) continue;

    results.push({
      source,
      summary: summary.trim() || "Imported stay",
      checkinDate,
      checkoutDate,
    });
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const adminClient = createClient(supabaseUrl, publicSupabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await adminClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      (profile.role !== "admin" && profile.role !== "platform_admin")
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const formData = await request.formData();
    const propertyId = String(formData.get("propertyId") || "").trim();
    const file = formData.get("file");

    if (!propertyId) {
      return NextResponse.json({ error: "Property is required." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: property, error: propertyError } = await serviceClient
      .from("properties")
      .select("id, organization_id, name")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError || !property?.organization_id) {
      return NextResponse.json(
        { error: propertyError?.message || "Property not found." },
        { status: 404 }
      );
    }

    const csvText = await file.text();
    const csvRows = parseCsv(csvText);
    const importRows = buildImportRows(csvRows);

    if (importRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid booking rows were found. Use CSV headers like source, guest/summary, checkin/check-in, and checkout/check-out.",
        },
        { status: 400 }
      );
    }

    const payload = importRows.map((row) => ({
      organization_id: property.organization_id,
      property_id: propertyId,
      property_calendar_id: null,
      source: row.source,
      external_uid: `csv:${row.source}:${row.checkinDate}:${row.checkoutDate}`,
      summary: row.summary,
      checkin_date: row.checkinDate,
      checkout_date: row.checkoutDate,
      raw_dtstart: row.checkinDate,
      raw_dtend: row.checkoutDate,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await serviceClient
      .from("property_booking_events")
      .upsert(payload, {
        onConflict: "property_id,source,external_uid",
      });

    if (upsertError) {
      return NextResponse.json(
        {
          error:
            upsertError.message.includes("property_booking_events")
              ? "Booking history table not found. Run supabase/add_property_booking_events.sql first."
              : upsertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: payload.length,
      propertyName: property.name || "Property",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
