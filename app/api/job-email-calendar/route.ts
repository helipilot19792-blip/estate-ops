import { NextRequest } from "next/server";
import {
  buildJobCalendarIcs,
  getServiceClient,
  isCurrentJobEmailRecipient,
  loadJobEmailSlotDetails,
  verifyJobEmailActionUrl,
} from "@/lib/server/job-email-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const verification = verifyJobEmailActionUrl(request.nextUrl.searchParams);

  if (!verification.ok || verification.action !== "calendar") {
    return new Response(verification.ok ? "Invalid calendar link." : verification.error, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const service = getServiceClient();
    const details = await loadJobEmailSlotDetails(service, verification.kind, verification.slotId);

    if (!details) {
      return new Response("Job not found.", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const currentRecipient = await isCurrentJobEmailRecipient(
      service,
      verification.kind,
      details.accountId,
      verification.email
    );
    const currentOffer =
      Boolean(verification.offerVersion) && verification.offerVersion === String(details.offeredAt || "");

    if (!currentRecipient || !currentOffer) {
      return new Response("This calendar link belongs to an earlier offer or assignment.", {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (String(details.status || "").toLowerCase().trim() !== "accepted") {
      return new Response("Accept this job before adding it to your calendar.", {
        status: 409,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const ics = buildJobCalendarIcs(details, request.nextUrl.origin);
    const filename = `${verification.kind}-${details.jobId}.ics`;

    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not build calendar event.", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
