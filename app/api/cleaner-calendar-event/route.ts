import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  buildJobCalendarIcs,
  getServiceClient,
  loadJobEmailSlotDetails,
} from "@/lib/server/job-email-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function textResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const jobId = String(request.nextUrl.searchParams.get("jobId") || "").trim();
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!jobId) return textResponse("Missing jobId.", 400);
  if (!token) return textResponse("Authentication required.", 401);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  if (!supabaseUrl || !publicKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return textResponse("Calendar service is not configured.", 500);
  }

  try {
    const authClient = createClient(supabaseUrl, publicKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) return textResponse("Authentication required.", 401);

    const service = getServiceClient();
    const { data: slots, error: slotsError } = await service
      .from("turnover_job_slots")
      .select("id,cleaner_account_id,status")
      .eq("job_id", jobId)
      .in("status", ["accepted", "in_progress"]);

    if (slotsError) throw new Error(slotsError.message);

    const accountIds = [
      ...new Set((slots || []).map((slot) => slot.cleaner_account_id).filter(Boolean)),
    ];
    if (accountIds.length === 0) return textResponse("Calendar event not found.", 404);

    const { data: memberships, error: membershipError } = await service
      .from("cleaner_account_members")
      .select("cleaner_account_id")
      .eq("profile_id", user.id)
      .in("cleaner_account_id", accountIds);

    if (membershipError) throw new Error(membershipError.message);

    const allowedAccountIds = new Set((memberships || []).map((row) => row.cleaner_account_id));
    const authorizedSlot = (slots || []).find((slot) =>
      allowedAccountIds.has(slot.cleaner_account_id)
    );
    if (!authorizedSlot) return textResponse("Calendar event not found.", 404);

    const details = await loadJobEmailSlotDetails(service, "cleaner", authorizedSlot.id);
    if (!details) return textResponse("Calendar event not found.", 404);

    const ics = buildJobCalendarIcs(details, request.nextUrl.origin);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="cleaning-${jobId}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[cleaner-calendar-event] calendar generation failed", {
      jobId,
      message: error instanceof Error ? error.message : error,
    });
    return textResponse("Could not create calendar event.", 500);
  }
}
