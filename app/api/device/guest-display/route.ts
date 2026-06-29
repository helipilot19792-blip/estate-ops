import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getFirstNameFromBookingSummary,
  getTodayYmd,
  hashGuestDeviceToken,
  pickRelevantBooking,
} from "@/lib/server/guest-device";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getDeviceToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return request.headers.get("x-gulera-device-token")?.trim() || "";
}

function formatTimeLabel(value?: string | null) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function GET(request: NextRequest) {
  try {
    const token = getDeviceToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing device token." }, { status: 401 });
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: "Missing server environment variables." }, { status: 500 });
    }

    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tokenHash = hashGuestDeviceToken(token);
    const { data: device, error: deviceError } = await service
      .from("property_guest_devices")
      .select("id,label,organization_id,property_id,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (deviceError) {
      throw new Error(deviceError.message);
    }

    if (!device || device.revoked_at) {
      return NextResponse.json({ ok: false, error: "Device token is invalid or revoked." }, { status: 401 });
    }

    const [{ data: property, error: propertyError }, { data: bookings, error: bookingsError }] = await Promise.all([
      service
        .from("properties")
        .select("id,default_checkin_time,default_checkout_time")
        .eq("id", device.property_id)
        .eq("organization_id", device.organization_id)
        .maybeSingle(),
      service
        .from("property_booking_events")
        .select("id,summary,guest_count,checkin_date,checkout_date")
        .eq("property_id", device.property_id)
        .eq("organization_id", device.organization_id)
        .gte("checkout_date", getTodayYmd())
        .order("checkin_date", { ascending: true })
        .limit(10),
    ]);

    if (propertyError) {
      throw new Error(propertyError.message);
    }

    if (bookingsError) {
      throw new Error(bookingsError.message);
    }

    if (!property) {
      return NextResponse.json({ ok: false, error: "Property not found for this device." }, { status: 404 });
    }

    const relevantStay = pickRelevantBooking(bookings ?? []);
    const booking = relevantStay.booking;
    const guestFirstName = booking ? getFirstNameFromBookingSummary(booking.summary) : null;

    await service
      .from("property_guest_devices")
      .update({
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", device.id);

    return NextResponse.json({
      ok: true,
      device: {
        id: device.id,
        label: device.label,
      },
      stay: {
        status: relevantStay.stayStatus,
        guestFirstName,
        guestCount: typeof booking?.guest_count === "number" ? booking.guest_count : null,
        checkinDate: booking?.checkin_date || null,
        checkoutDate: booking?.checkout_date || null,
        checkinTime: formatTimeLabel(property.default_checkin_time),
        checkoutTime: formatTimeLabel(property.default_checkout_time),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load guest display data." },
      { status: 500 }
    );
  }
}
