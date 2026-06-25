import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import {
  createBillingServiceClient,
  syncOrganizationFromCheckoutSession,
  syncOrganizationFromStripeSubscription,
} from "@/lib/server/stripe-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function syncFromInvoice(
  serviceClient: ReturnType<typeof createBillingServiceClient>,
  invoice: Stripe.Invoice
) {
  const subscriptionValue = (
    invoice as Stripe.Invoice & {
      subscription?: string | { id?: string | null } | null;
    }
  ).subscription;
  const subscriptionId =
    typeof subscriptionValue === "string" ? subscriptionValue : subscriptionValue?.id || "";

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncOrganizationFromStripeSubscription({
    serviceClient,
    subscription,
  });
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature header." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const serviceClient = createBillingServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await syncOrganizationFromCheckoutSession({
          stripe,
          serviceClient,
          session,
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncOrganizationFromStripeSubscription({
          serviceClient,
          subscription,
        });
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await syncFromInvoice(serviceClient, invoice);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
