export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;

  const response = await fetch(`${origin}/api/sync-calendars`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${expected}`,
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  return Response.json({
    ok: response.ok,
    status: response.status,
    payload,
  });
}