export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

import { sendScheduledJobNotificationEmails } from "@/lib/server/job-notifications";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const payload = await sendScheduledJobNotificationEmails(origin);

  return Response.json({
    ok: true,
    payload,
  });
}
