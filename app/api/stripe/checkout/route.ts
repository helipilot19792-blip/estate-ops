import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  ensureStripeCustomerForOrganization,
  getBillingAppUrl,
  getStripePlanByKey,
  markOrganizationCheckoutStarted,
  requireBillingAdminAccess,
} from "@/lib/server/stripe-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const organizationId = String(body?.organizationId || "").trim();
    const planKey = String(body?.planKey || "").trim();

    if (!organizationId) {
      return NextResponse.json({ error: "Missing organizationId." }, { status: 400 });
    }

    const plan = getStripePlanByKey(planKey);

    if (!plan || !plan.priceId) {
      return NextResponse.json({ error: "This Stripe plan is not configured yet." }, { status: 400 });
    }

    const { user, profile, organization, serviceClient } = await requireBillingAdminAccess(
      request.headers.get("authorization"),
      organizationId
    );

    if ((organization.account_type || "").toLowerCase() === "internal") {
      return NextResponse.json(
        { error: "Internal workspaces do not use Stripe billing." },
        { status: 400 }
      );
    }

    const currentStatus = String(organization.subscription_status || "trialing").toLowerCase();

    if (
      organization.stripe_subscription_id &&
      (currentStatus === "active" || currentStatus === "past_due")
    ) {
      return NextResponse.json(
        { error: "This workspace already has Stripe billing. Use Manage billing instead." },
        { status: 409 }
      );
    }

    const email = profile.email?.trim() || user.email?.trim() || "";

    if (!email) {
      return NextResponse.json(
        { error: "Your admin profile needs an email address before billing can start." },
        { status: 400 }
      );
    }

    const customerId = await ensureStripeCustomerForOrganization({
      stripe,
      organization,
      serviceClient,
      email,
      fullName: profile.full_name,
    });

    const appUrl = getBillingAppUrl(request.nextUrl.origin);
    const successUrl = `${appUrl}/admin?organizationId=${encodeURIComponent(organizationId)}&billing=success`;
    const cancelUrl = `${appUrl}/admin?organizationId=${encodeURIComponent(organizationId)}&billing=cancelled`;

    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      customer: customerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: {
        organizationId,
        planKey: plan.key,
        requestedBy: user.id,
      },
      mode: "subscription",
      subscription_data: {
        metadata: {
          organizationId,
          planKey: plan.key,
        },
      },
      success_url: successUrl,
    });

    await markOrganizationCheckoutStarted({
      serviceClient,
      organizationId,
      customerId,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : null,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Stripe checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
