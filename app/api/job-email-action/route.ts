import { NextRequest } from "next/server";
import {
  createJobEmailActionUrl,
  getServiceClient,
  isCurrentJobEmailRecipient,
  loadJobEmailSlotDetails,
  refreshJobStaffing,
  verifyJobEmailActionUrl,
} from "@/lib/server/job-email-actions";
import { sendAdminJobStatusPush } from "@/lib/server/admin-job-status-notifications";
import { writeAuditLog } from "@/lib/server/audit-log";

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
  confirmation?: { action: "accept" | "decline"; formAction: string };
}) {
  const calendarScript = options.calendarUrl
    ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(options.calendarUrl)}; }, 900);</script>`
    : "";
  const confirmation = options.confirmation
    ? `<form method="post" action="${escapeHtml(options.confirmation.formAction)}">
         <input type="hidden" name="confirm" value="yes" />
         <button class="primary" type="submit">${options.confirmation.action === "accept" ? "Accept this job" : "Decline this job"}</button>
       </form>`
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
      form { display: inline-block; margin: 0; }
      a, button { display: inline-block; margin: 6px 8px 0 0; padding: 12px 16px; border-radius: 999px; text-decoration: none; font: inherit; font-weight: 700; cursor: pointer; }
      button { border: 0; }
      .primary { background: #241c15; color: #fff; }
      .secondary { border: 1px solid #cdbda0; color: #241c15; background: #fff; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${escapeHtml(options.heading)}</h1>
        <p>${escapeHtml(options.message)}</p>
        ${confirmation}
        ${options.calendarUrl ? `<a class="primary" href="${escapeHtml(options.calendarUrl)}">Add to calendar</a>` : ""}
        ${options.portalUrl ? `<a class="secondary" href="${escapeHtml(options.portalUrl)}">Open portal</a>` : ""}
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

function issuePage(message: string, status: number, portalUrl?: string) {
  return htmlResponse(
    pageHtml({
      title: "Job link issue",
      heading: "This link could not be used",
      message,
      portalUrl,
    }),
    status
  );
}

export async function GET(request: NextRequest) {
  const verification = verifyJobEmailActionUrl(request.nextUrl.searchParams);

  if (!verification.ok) return issuePage(verification.error, 400);
  if (verification.action === "calendar") {
    return issuePage("This link can only accept or decline a job.", 400);
  }

  const portalUrl = `${request.nextUrl.origin}/${verification.kind}`;

  try {
    const service = getServiceClient();
    const details = await loadJobEmailSlotDetails(service, verification.kind, verification.slotId);

    if (!details) return issuePage("The job may have been removed or reassigned.", 404, portalUrl);

    const currentRecipient = await isCurrentJobEmailRecipient(
      service,
      verification.kind,
      details.accountId,
      verification.email
    );
    const currentOffer =
      Boolean(verification.offerVersion) && verification.offerVersion === String(details.offeredAt || "");

    if (!currentRecipient || !currentOffer) {
      return issuePage(
        "This email belongs to an earlier offer or assignment and can no longer change the job. Please use the portal or a fresh job email.",
        409,
        portalUrl
      );
    }

    const currentStatus = String(details.status || "").toLowerCase().trim();
    const desiredStatus = verification.action === "accept" ? "accepted" : "declined";

    if (currentStatus === desiredStatus) {
      const calendarUrl = verification.action === "accept"
        ? createJobEmailActionUrl(
            request.nextUrl.origin,
            verification.kind,
            "calendar",
            verification.slotId,
            verification.email,
            { expiresAtMs: verification.expiresAt, offerVersion: verification.offerVersion }
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
      return issuePage(
        `${details.propertyName} is currently marked as ${currentStatus || "unavailable"}, so this email link cannot change it.`,
        409,
        portalUrl
      );
    }

    return htmlResponse(
      pageHtml({
        title: verification.action === "accept" ? "Confirm job acceptance" : "Confirm job decline",
        heading: verification.action === "accept" ? "Accept this job?" : "Decline this job?",
        message: `${details.propertyName}${details.jobDate ? ` on ${details.jobDate}` : ""} will only be updated after you confirm below.`,
        confirmation: {
          action: verification.action === "accept" ? "accept" : "decline",
          formAction: `${request.nextUrl.pathname}${request.nextUrl.search}`,
        },
        portalUrl,
      })
    );
  } catch (error) {
    return issuePage(error instanceof Error ? error.message : "The job could not be checked.", 500, portalUrl);
  }
}

export async function POST(request: NextRequest) {
  const verification = verifyJobEmailActionUrl(request.nextUrl.searchParams);

  if (!verification.ok) return issuePage(verification.error, 400);
  if (verification.action === "calendar") return issuePage("This link cannot update a job.", 400);

  const portalUrl = `${request.nextUrl.origin}/${verification.kind}`;
  const formData = await request.formData().catch(() => null);
  if (formData?.get("confirm") !== "yes") return issuePage("Please open the email link and confirm your choice.", 400, portalUrl);

  try {
    const service = getServiceClient();
    const details = await loadJobEmailSlotDetails(service, verification.kind, verification.slotId);

    if (!details) return issuePage("The job may have been removed or reassigned.", 404, portalUrl);

    const currentRecipient = await isCurrentJobEmailRecipient(
      service,
      verification.kind,
      details.accountId,
      verification.email
    );
    const currentOffer =
      Boolean(verification.offerVersion) && verification.offerVersion === String(details.offeredAt || "");

    if (!currentRecipient || !currentOffer) {
      return issuePage(
        "This email belongs to an earlier offer or assignment and can no longer change the job. Please use the portal or a fresh job email.",
        409,
        portalUrl
      );
    }

    if (String(details.status || "").toLowerCase().trim() !== "offered") {
      return issuePage("This job changed before you confirmed. Please check the portal for its current status.", 409, portalUrl);
    }

    const now = new Date().toISOString();
    const slotTable = verification.kind === "cleaner" ? "turnover_job_slots" : "grounds_job_slots";
    const accountIdColumn = verification.kind === "cleaner" ? "cleaner_account_id" : "grounds_account_id";
    const update = verification.action === "accept"
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
      .eq(accountIdColumn, details.accountId)
      .eq("offered_at", details.offeredAt)
      .select(`id, job_id, status, ${accountIdColumn}`)
      .maybeSingle()) as any;

    if (updateError) throw new Error(updateError.message);
    if (!updatedSlot) {
      return issuePage("This job changed before you confirmed. Please check the portal for its current status.", 409, portalUrl);
    }

    try {
      await writeAuditLog(service, {
        actorEmail: verification.email,
        actorRole: `${verification.kind}_email`,
        organizationId: details.organizationId,
        actionType: `${verification.kind}.email_job_${verification.action}`,
        targetType: slotTable,
        targetId: verification.slotId,
        metadata: {
          job_id: updatedSlot.job_id,
          offered_account_id: details.accountId,
          resulting_account_id: updatedSlot[accountIdColumn] || null,
          resulting_status: updatedSlot.status || null,
          offer_version: verification.offerVersion,
        },
      });
    } catch (auditError) {
      console.error("Could not write job email action audit log", auditError);
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

    const calendarUrl = verification.action === "accept"
      ? createJobEmailActionUrl(
          request.nextUrl.origin,
          verification.kind,
          "calendar",
          verification.slotId,
          verification.email,
          { expiresAtMs: verification.expiresAt, offerVersion: verification.offerVersion }
        )
      : undefined;

    return htmlResponse(
      pageHtml({
        title: verification.action === "accept" ? "Job accepted" : "Job declined",
        heading: verification.action === "accept" ? "Job accepted" : "Job declined",
        message: verification.action === "accept"
          ? `${details.propertyName} has been added to your accepted jobs. Your phone should ask to add the calendar event next.`
          : `${details.propertyName} has been declined. Thank you for responding.`,
        calendarUrl,
        portalUrl,
      })
    );
  } catch (error) {
    return issuePage(error instanceof Error ? error.message : "The job could not be updated.", 500, portalUrl);
  }
}
