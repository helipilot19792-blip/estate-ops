import { createClient } from "@supabase/supabase-js";
import { sendStaffPushNotifications } from "@/lib/server/staff-push-notifications";

type PropertyKnowledgeRow = {
  property_id: string;
  guest_registration_required?: boolean | null;
  guest_registration_lead_days?: number | null;
  guest_registration_instructions?: string | null;
};

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string | null;
  address: string | null;
};

type BookingEventRow = {
  id: string;
  organization_id: string;
  property_id: string;
  summary: string | null;
  checkin_date: string;
  guest_registration_reminder_sent_at?: string | null;
};

function isMissingGuestRegistrationSchemaError(
  error: { code?: string | null; message?: string | null } | null | undefined
) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    message.includes("guest_registration_required") ||
    message.includes("guest_registration_lead_days") ||
    message.includes("guest_registration_reminder_sent_at") ||
    message.includes("does not exist")
  );
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateYmd: string, days: number) {
  const next = new Date(`${dateYmd}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function sendScheduledGuestRegistrationReminders(origin: string) {
  const service = getServiceClient();
  const todayYmd = getTodayYmd();

  const { data: knowledgeRows, error: knowledgeError } = await service
    .from("property_knowledge")
    .select("property_id, guest_registration_required, guest_registration_lead_days, guest_registration_instructions")
    .eq("guest_registration_required", true);

  if (knowledgeError) {
    if (isMissingGuestRegistrationSchemaError(knowledgeError)) {
      return { considered: 0, sent: 0, skipped: 0, errors: [] as string[] };
    }
    throw new Error(knowledgeError.message);
  }

  const reminderConfigs = (knowledgeRows ?? []) as PropertyKnowledgeRow[];
  if (reminderConfigs.length === 0) {
    return { considered: 0, sent: 0, skipped: 0, errors: [] as string[] };
  }

  const propertyIds = Array.from(new Set(reminderConfigs.map((row) => row.property_id).filter(Boolean)));
  const targetCheckinDates = Array.from(
    new Set(
      reminderConfigs.map((row) => addDays(todayYmd, Math.max(0, Math.min(30, Number(row.guest_registration_lead_days || 3)))))
    )
  );

  const [propertiesRes, bookingsRes] = await Promise.all([
    service
      .from("properties")
      .select("id, organization_id, name, address")
      .in("id", propertyIds),
    service
      .from("property_booking_events")
      .select("id, organization_id, property_id, summary, checkin_date, guest_registration_reminder_sent_at")
      .in("property_id", propertyIds)
      .in("checkin_date", targetCheckinDates),
  ]);

  if (propertiesRes.error) {
    throw new Error(propertiesRes.error.message);
  }

  if (bookingsRes.error) {
    if (isMissingGuestRegistrationSchemaError(bookingsRes.error)) {
      return { considered: 0, sent: 0, skipped: 0, errors: [] as string[] };
    }
    throw new Error(bookingsRes.error.message);
  }

  const properties = new Map(
    ((propertiesRes.data ?? []) as PropertyRow[]).map((property) => [property.id, property])
  );
  const configByPropertyId = new Map(
    reminderConfigs.map((row) => [row.property_id, row])
  );

  let considered = 0;
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const booking of (bookingsRes.data ?? []) as BookingEventRow[]) {
    const config = configByPropertyId.get(booking.property_id);
    const property = properties.get(booking.property_id);
    if (!config || !property) {
      skipped += 1;
      continue;
    }

    const leadDays = Math.max(0, Math.min(30, Number(config.guest_registration_lead_days || 3)));
    if (booking.checkin_date !== addDays(todayYmd, leadDays)) {
      skipped += 1;
      continue;
    }

    if (booking.guest_registration_reminder_sent_at) {
      skipped += 1;
      continue;
    }

    considered += 1;

    const { data: adminMembers, error: adminError } = await service
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", booking.organization_id)
      .eq("role", "admin");

    if (adminError) {
      errors.push(`${property.name || property.address || booking.property_id}: ${adminError.message}`);
      continue;
    }

    const adminProfileIds = Array.from(
      new Set((adminMembers ?? []).map((member: { profile_id: string | null }) => String(member.profile_id || "")).filter(Boolean))
    );

    if (adminProfileIds.length === 0) {
      skipped += 1;
      continue;
    }

    const propertyName = property.name || property.address || "Property";
    const guestLabel = booking.summary?.trim() || "Upcoming guest";
    const instructions = String(config.guest_registration_instructions || "").trim();
    const body = instructions
      ? `${guestLabel} checks in at ${propertyName} in ${leadDays} day${leadDays === 1 ? "" : "s"}. Register the guest with the resort. ${instructions}`
      : `${guestLabel} checks in at ${propertyName} in ${leadDays} day${leadDays === 1 ? "" : "s"}. Register the guest with the resort before arrival.`;

    try {
      const result = await sendStaffPushNotifications("admin", adminProfileIds, {
        title: `Guest registration reminder: ${propertyName}`,
        body,
        url: `${origin}/admin?open=calendar&date=${encodeURIComponent(booking.checkin_date)}`,
        tag: `guest-registration-${booking.id}`,
      });

      if (result.sent > 0) {
        sent += result.sent;
        const { error: updateError } = await service
          .from("property_booking_events")
          .update({
            guest_registration_reminder_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", booking.id);

        if (updateError) {
          errors.push(`${propertyName}: ${updateError.message}`);
        }
      } else if (result.errors.length > 0) {
        errors.push(`${propertyName}: ${result.errors.join("; ")}`);
      } else {
        skipped += 1;
      }
    } catch (error) {
      errors.push(
        `${propertyName}: ${error instanceof Error ? error.message : "Unknown guest registration reminder error."}`
      );
    }
  }

  return { considered, sent, skipped, errors };
}
