export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { sendScheduledGuestRegistrationReminders } from "@/lib/server/guest-registration-reminders";
import { sendScheduledJobNotificationEmails } from "@/lib/server/job-notifications";
import { createClient } from "@supabase/supabase-js";
import {
  activateDueHeldCleanerJobs,
} from "@/lib/server/cleaner-job-activation";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ ok: false, error: "Missing Supabase server environment variables." }, { status: 500 });
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const heldJobActivations = await activateDueHeldCleanerJobs(service, origin);
  const [jobNotifications, guestRegistrationReminders] = await Promise.all([
    sendScheduledJobNotificationEmails(origin),
    sendScheduledGuestRegistrationReminders(origin),
  ]);

  return Response.json({
    ok: true,
    payload: {
      jobNotifications,
      guestRegistrationReminders,
      heldJobActivations,
    },
  });
}
