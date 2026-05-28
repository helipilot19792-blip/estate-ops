import { NextRequest } from "next/server";
import {
  createJobEmailActionUrl,
  getServiceClient,
  loadJobEmailSlotDetails,
  refreshJobStaffing,
  verifyJobEmailActionUrl,
} from "@/lib/server/job-email-actions";
import { sendAdminJobStatusPush } from "@/lib/server/admin-job-status-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageHtml(options: {
  title: string;
  heading: string;
  message: string;
  calendarUrl?: string;
  portalUrl?: string;
}) {
  const calendarScript = options.calendarUrl
    ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(options.calendarUrl)}; }, 900);</script>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #fcfaf7; color: #241c15; }
      main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      section { width: min(540px, 100%); border: 1px solid #e2d6c7; border-radius: 8px; background: #fff; padding: 26px; box-shadow: 0 18px 50px rgba(36, 28, 21, 0.08); }
      h1 { margin: 0 0 12px; font-size: 28px; line-height: 1.15; }
      p { margin: 0 0 18px; color: #5f5245; line-height: 1.5; }
      a { display: inline-block; margin: 6px 8px 0 0; padding: 12px 16px; border-radius: 999px; text-decoration: none; font-weight: 700; }
      .primary { background: #241c15; color: #fff; }
      .secondary { border: 1px solid #cdbda0; color: #241c15; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(options.heading)}</h1>
        <p>${escapeHtml(options.message)}</p>
        ${
          options.calendarUrl
            ? `<a class="primary" href="${escapeHtml(options.calendarUrl)}">Add to calendar</a>`
            : ""
        }
        ${
          options.portalUrl
            ? `<a class="secondary" href="${escapeHtml(options.portalUrl)}">Open portal</a>`
            : ""
        }
      </section>
    </main>
    ${calendarScript}
  </body>
</html>`;
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  const verification = verifyJobEmailActionUrl(request.nextUrl.searchParams);

  if (!verification.ok) {
    return htmlResponse(
      pageHtml({
        title: "Job link issue",
        heading: "This link could not be used",
        message: verification.error,
      }),
      400
    );
  }

  if (verification.action === "calendar") {
    return htmlResponse(
      pageHtml({
        title: "Calendar link issue",
        heading: "Use the calendar button instead",
        message: "This link can only accept or decline a job.",
      }),
      400
    );
  }

  try {
    const service = getServiceClient();
    const details = await loadJobEmailSlotDetails(service, verification.kind, verification.slotId);

    if (!details) {
      return htmlResponse(
        pageHtml({
          title: "Job not found",
          heading: "This job was not found",
          message: "The job may have been removed or reassigned.",
        }),
        404
      );
    }

    const currentStatus = String(details.status || "").toLowerCase().trim();
    const desiredStatus = verification.action === "accept" ? "accepted" : "declined";
    const portalUrl = `${request.nextUrl.origin}/${verification.kind}`;

    if (currentStatus === desiredStatus) {
      const calendarUrl =
        verification.action === "accept"
          ? createJobEmailActionUrl(
              request.nextUrl.origin,
              verification.kind,
              "calendar",
              verification.slotId,
              verification.email
            )
          : undefined;

      return htmlResponse(
        pageHtml({
          title: "Job already updated",
          heading: verification.action === "accept" ? "This job is already accepted" : "This job is already declined",
          message: `${details.propertyName} is already marked as ${desiredStatus}.`,
          calendarUrl,
          portalUrl,
        })
      );
    }

    if (currentStatus !== "offered") {
      return htmlResponse(
        pageHtml({
          title: "Job cannot be updated",
          heading: "This job is no longer open",
          message: `${details.propertyName} is currently marked as ${currentStatus || "unavailable"}, so this email link cannot change it.`,
          portalUrl,
        }),
        409
      );
    }

    const now = new Date().toISOString();
    const slotTable = verification.kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
    const accountIdColumn = verification.kind === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
    const update =
      verification.action === "accept"
        ? {
            status: "accepted",
            accepted_at: now,
            declined_at: null,
            accepted_by_profile_id: null,
            declined_by_profile_id: null,
          }
        : {
            status: "declined",
            declined_at: now,
            accepted_at: null,
            declined_by_profile_id: null,
            accepted_by_profile_id: null,
          };

    const { data: updatedSlot, error: updateError } = await (service
      .from(slotTable as any)
      .update(update)
      .eq("id", verification.slotId)
      .eq("status", "offered")
      .select(`id, job_id, status, ${accountIdColumn}`)
      .maybeSingle()) as any;

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (!updatedSlot) {
      return htmlResponse(
        pageHtml({
          title: "Job could not be updated",
          heading: "This job changed before the email link finished",
          message: "Please refresh the portal or ask for a fresh job email.",
          portalUrl,
        }),
        409
      );
    }

    await refreshJobStaffing(service, verification.kind, updatedSlot.job_id);

    if (verification.action === "accept") {
      await sendAdminJobStatusPush(
        service,
        verification.kind,
        updatedSlot.job_id,
        updatedSlot[accountIdColumn] || null,
        "accepted",
        request.nextUrl.origin
      );
    }

    const calendarUrl =
      verification.action === "accept"
        ? createJobEmailActionUrl(
            request.nextUrl.origin,
            verification.kind,
            "calendar",
            verification.slotId,
            verification.email
          )
        : undefined;

    return htmlResponse(
      pageHtml({
        title: verification.action === "accept" ? "Job accepted" : "Job declined",
        heading: verification.action === "accept" ? "Job accepted" : "Job declined",
        message:
          verification.action === "accept"
            ? `${details.propertyName} has been added to your accepted jobs. Your phone should ask to add the calendar event next.`
            : `${details.propertyName} has been declined. Thank you for responding.`,
        calendarUrl,
        portalUrl,
      })
    );
  } catch (error) {
    return htmlResponse(
      pageHtml({
        title: "Job update failed",
        heading: "Something went wrong",
        message: error instanceof Error ? error.message : "The job could not be updated.",
      }),
      500
    );
  }
}
