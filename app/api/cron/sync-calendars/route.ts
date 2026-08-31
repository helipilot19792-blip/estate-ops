export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;

  try {
    const response = await fetch(`${origin}/api/sync-calendars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${expected}`,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Scheduled calendar sync failed.", {
        status: response.status,
        payload,
      });
    }

    return Response.json(
      {
        ok: response.ok,
        status: response.status,
        payload,
      },
      { status: response.ok ? 200 : response.status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown calendar sync error.";
    console.error("Scheduled calendar sync request failed.", { message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
