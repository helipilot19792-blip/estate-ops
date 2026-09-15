export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (!expected || authHeader !== `Bearer ${expected}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    // Run in this invocation so deployment protection, redirects, and a second
    // function's timeout cannot interrupt the scheduled sync.
    const { POST } = await import("@/app/api/sync-calendars/route");
    const response = await POST(new Request(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${expected}`,
      },
    }));

    const payload = await response.json().catch(() => null);

    const ok = response.ok && payload?.ok === true &&
      Number(payload?.totals?.errors ?? 0) === 0 &&
      (payload?.same_day_cleaner_conflicts?.errors?.length ?? 0) === 0;
    const status = ok ? 200 : response.ok ? 500 : response.status;

    if (!ok) {
      console.error("Scheduled calendar sync failed.", {
        status: response.status,
        payload,
      });
    } else {
      console.info("Scheduled calendar sync completed.", {
        duration_ms: Date.now() - startedAt,
        calendars_found: payload.calendars_found,
        totals: payload.totals,
      });
    }

    return Response.json(
      {
        ok,
        status,
        payload,
      },
      { status }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown calendar sync error.";
    console.error("Scheduled calendar sync request failed.", { message });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
