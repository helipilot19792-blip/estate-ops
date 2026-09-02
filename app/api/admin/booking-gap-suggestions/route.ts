import {
  addDaysYmd,
  detectBookingGapSuggestions,
  detectPortfolioSeasonality,
} from "@/lib/booking-gap-watch";
import { writeAuditLog } from "@/lib/server/audit-log";
import { requireOrganizationAdmin, getOrganizationAccessErrorStatus } from "@/lib/server/organization-access";
import { authenticateBearerRequest, createServiceRoleClient } from "@/lib/server/request-auth";
import {
  assertWorkspaceBillingAccessForOrganization,
  getWorkspaceBillingErrorStatus,
} from "@/lib/server/workspace-billing-status";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set(["dismissed", "snoozed", "handled"]);

function isMissingTableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  tableName: string
) {
  const message = error?.message || "";
  return (
    error?.code === "PGRST205" ||
    message.includes(tableName) &&
      (message.includes("does not exist") || message.includes("Could not find the table"))
  );
}

function getTodayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function authorize(request: Request, organizationId: string) {
  const auth = await authenticateBearerRequest(request);
  if (!auth.ok) {
    return { response: Response.json({ ok: false, error: auth.error }, { status: auth.status }) };
  }

  const service = createServiceRoleClient();
  const profile = await requireOrganizationAdmin(service, auth.user.id, organizationId);
  await assertWorkspaceBillingAccessForOrganization(service, organizationId);
  return { service, profile, user: auth.user };
}

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId")?.trim() || "";
    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    const admin = await authorize(request, organizationId);
    if ("response" in admin) return admin.response;

    const settingsResult = await admin.service
      .from("booking_gap_watch_settings")
      .select("enabled")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const settingsSupported = !settingsResult.error;
    if (
      settingsResult.error &&
      !isMissingTableError(settingsResult.error, "booking_gap_watch_settings")
    ) {
      throw new Error(settingsResult.error.message);
    }
    const enabled = settingsResult.data?.enabled !== false;

    if (!enabled) {
      return Response.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        enabled: false,
        settingsSupported,
        analyzedPropertyCount: 0,
        suggestions: [],
        seasonallyConsolidatedCount: 0,
        actionsSupported: true,
      });
    }

    const todayYmd = getTodayYmd();
    const horizonEnd = addDaysYmd(todayYmd, 45);
    const historyStart = addDaysYmd(todayYmd, -60);
    const propertiesResult = await admin.service
      .from("properties")
      .select("id,name,address")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });
    if (propertiesResult.error) throw new Error(propertiesResult.error.message);

    const propertyIds = (propertiesResult.data ?? []).map((property) => property.id);
    const [calendarsResult, bookingsResult, actionsResult] = await Promise.all([
      propertyIds.length > 0
        ? admin.service
            .from("property_calendars")
            .select("property_id,is_active,last_synced_at")
            .in("property_id", propertyIds)
        : Promise.resolve({ data: [], error: null }),
      admin.service
        .from("property_booking_events")
        .select("property_id,checkin_date,checkout_date")
        .eq("organization_id", organizationId)
        .gt("checkout_date", historyStart)
        .lt("checkin_date", horizonEnd),
      admin.service
        .from("booking_gap_suggestion_actions")
        .select("suggestion_key,status,snoozed_until")
        .eq("organization_id", organizationId),
    ]);

    if (calendarsResult.error) throw new Error(calendarsResult.error.message);
    if (bookingsResult.error) throw new Error(bookingsResult.error.message);

    const actionsSupported = !actionsResult.error;
    if (
      actionsResult.error &&
      !isMissingTableError(actionsResult.error, "booking_gap_suggestion_actions")
    ) {
      throw new Error(actionsResult.error.message);
    }

    const connectedPropertyIds = new Set(
      (calendarsResult.data ?? [])
        .filter((calendar) => calendar.is_active !== false)
        .map((calendar) => calendar.property_id)
    );
    const allSuggestions = detectBookingGapSuggestions({
      properties: propertiesResult.data ?? [],
      bookings: bookingsResult.data ?? [],
      connectedPropertyIds,
      todayYmd,
      horizonDays: 45,
    });
    const seasonality = detectPortfolioSeasonality({
      properties: propertiesResult.data ?? [],
      bookings: bookingsResult.data ?? [],
      connectedPropertyIds,
      todayYmd,
    });
    const seasonAdjustedSuggestions = seasonality.isSlowSeason
      ? allSuggestions.filter(
          (suggestion) =>
            (suggestion.kind === "orphan_gap" && suggestion.urgency !== "low") ||
            (suggestion.urgency === "high" && suggestion.kind !== "open_stretch")
        )
      : allSuggestions;
    const seasonallyConsolidatedCount = allSuggestions.length - seasonAdjustedSuggestions.length;
    const actionByKey = new Map(
      (actionsResult.data ?? []).map((action) => [action.suggestion_key, action])
    );
    const nowMs = Date.now();
    const suggestions = seasonAdjustedSuggestions.filter((suggestion) => {
      const action = actionByKey.get(suggestion.key);
      if (!action) return true;
      if (action.status === "dismissed" || action.status === "handled") return false;
      if (action.status === "snoozed" && action.snoozed_until) {
        return Date.parse(action.snoozed_until) <= nowMs;
      }
      return true;
    });

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      enabled: true,
      settingsSupported,
      analyzedPropertyCount: connectedPropertyIds.size,
      suggestions,
      seasonality,
      seasonallyConsolidatedCount,
      actionsSupported,
    });
  } catch (error) {
    const accessStatus = getOrganizationAccessErrorStatus(error);
    const status = accessStatus !== 500 ? accessStatus : getWorkspaceBillingErrorStatus(error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not analyze booking gaps." },
      { status }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const propertyId = String(body?.propertyId || "").trim();
    const suggestionKey = String(body?.suggestionKey || "").trim();
    const action = String(body?.action || "").trim();

    if (!organizationId) {
      return Response.json({ ok: false, error: "Missing organizationId." }, { status: 400 });
    }

    if (action === "set_enabled") {
      if (typeof body?.enabled !== "boolean") {
        return Response.json({ ok: false, error: "An enabled value is required." }, { status: 400 });
      }

      const admin = await authorize(request, organizationId);
      if ("response" in admin) return admin.response;
      const nowIso = new Date().toISOString();
      const { data: settings, error } = await admin.service
        .from("booking_gap_watch_settings")
        .upsert(
          {
            organization_id: organizationId,
            enabled: body.enabled,
            updated_by_profile_id: admin.user.id,
            updated_at: nowIso,
          },
          { onConflict: "organization_id" }
        )
        .select("enabled,updated_at")
        .single();

      if (error) {
        if (isMissingTableError(error, "booking_gap_watch_settings")) {
          return Response.json(
            { ok: false, error: "The Booking Gap Watch switch needs the latest database migration." },
            { status: 503 }
          );
        }
        throw new Error(error.message);
      }

      try {
        await writeAuditLog(admin.service, {
          actorProfileId: admin.user.id,
          actorEmail: admin.profile.email,
          actorRole: admin.profile.role,
          organizationId,
          actionType: body.enabled ? "booking_gap_watch.enabled" : "booking_gap_watch.disabled",
          targetType: "organization",
          targetId: organizationId,
          metadata: { enabled: body.enabled },
        });
      } catch {
        // The setting is already saved; audit logging is non-blocking here.
      }

      return Response.json({ ok: true, settings });
    }

    if (!organizationId || !propertyId || !suggestionKey || !ALLOWED_ACTIONS.has(action)) {
      return Response.json({ ok: false, error: "Missing or invalid suggestion action." }, { status: 400 });
    }
    if (suggestionKey.length > 180 || !suggestionKey.startsWith(`v1:${propertyId}:`)) {
      return Response.json({ ok: false, error: "Invalid suggestion key." }, { status: 400 });
    }

    const admin = await authorize(request, organizationId);
    if ("response" in admin) return admin.response;

    const { data: property, error: propertyError } = await admin.service
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property) {
      return Response.json({ ok: false, error: "Property not found." }, { status: 404 });
    }

    const now = new Date();
    const snoozedUntil = action === "snoozed"
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data: savedAction, error } = await admin.service
      .from("booking_gap_suggestion_actions")
      .upsert(
        {
          organization_id: organizationId,
          property_id: propertyId,
          suggestion_key: suggestionKey,
          status: action,
          snoozed_until: snoozedUntil,
          acted_by_profile_id: admin.user.id,
          updated_at: now.toISOString(),
        },
        { onConflict: "organization_id,suggestion_key" }
      )
      .select("suggestion_key,status,snoozed_until")
      .single();

    if (error) {
      if (isMissingTableError(error, "booking_gap_suggestion_actions")) {
        return Response.json(
          { ok: false, error: "Booking Gap Watch actions need the latest database migration." },
          { status: 503 }
        );
      }
      throw new Error(error.message);
    }

    try {
      await writeAuditLog(admin.service, {
        actorProfileId: admin.user.id,
        actorEmail: admin.profile.email,
        actorRole: admin.profile.role,
        organizationId,
        actionType: `booking_gap_suggestion.${action}`,
        targetType: "booking_gap_suggestion",
        targetId: suggestionKey,
        metadata: { property_id: propertyId, snoozed_until: snoozedUntil },
      });
    } catch {
      // The decision is already saved. An audit issue should not encourage a duplicate retry.
    }

    return Response.json({ ok: true, action: savedAction });
  } catch (error) {
    const accessStatus = getOrganizationAccessErrorStatus(error);
    const status = accessStatus !== 500 ? accessStatus : getWorkspaceBillingErrorStatus(error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not update the suggestion." },
      { status }
    );
  }
}
