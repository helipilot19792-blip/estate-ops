import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getBillingAppUrl, requireBillingAdminAccess } from "@/lib/server/stripe-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId." }, { status: 400 });
    }

    const { organization } = await requireBillingAdminAccess(
      request.headers.get("authorization"),
      organizationId
    );

    if (!organization.stripe_customer_id) {
      return NextResponse.json(
        { error: "This workspace does not have a Stripe billing profile yet." },
        { status: 400 }
      );
    }

    const appUrl = getBillingAppUrl(request.nextUrl.origin);
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: `${appUrl}/admin?organizationId=${encodeURIComponent(organizationId)}&billing=portal`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
