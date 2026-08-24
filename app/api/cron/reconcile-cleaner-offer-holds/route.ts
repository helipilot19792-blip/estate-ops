export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { reconcileCleanerOfferHoldForJob } from "@/lib/server/cleaner-job-activation";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { ok: false, error: "Missing Supabase server environment variables." },
      { status: 500 }
    );
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const requestUrl = new URL(request.url);
  const organizationId = requestUrl.searchParams.get("organizationId")?.trim() || "";
  const jobId = requestUrl.searchParams.get("jobId")?.trim() || "";
  if (!organizationId || !jobId) {
    return Response.json(
      { ok: false, error: "organizationId and jobId are required." },
      { status: 400 }
    );
  }

  const holdReconciliation = await reconcileCleanerOfferHoldForJob(service, {
    organizationId,
    jobId,
    origin: requestUrl.origin,
  });

  return Response.json({
    ok: holdReconciliation.errors.length === 0,
    payload: { holdReconciliation },
  });
}
