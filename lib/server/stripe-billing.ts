import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

export type BillingPlanKey = "starter_monthly" | "growth_monthly" | "founding_annual";

type StripePlanDefinition = {
  key: BillingPlanKey;
  envKey: string;
  label: string;
  propertyLimit: number;
  memberLimit: number;
};

type OrganizationSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "suspended";

type OrganizationBillingRecord = {
  id: string;
  name: string | null;
  slug: string | null;
  created_by?: string | null;
  subscription_status?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  account_type?: string | null;
  plan_name?: string | null;
  property_limit?: number | null;
  member_limit?: number | null;
};

const STRIPE_PLANS: StripePlanDefinition[] = [
  {
    key: "starter_monthly",
    envKey: "STRIPE_PRICE_STARTER_MONTHLY",
    label: "Starter",
    propertyLimit: 10,
    memberLimit: 15,
  },
  {
    key: "growth_monthly",
    envKey: "STRIPE_PRICE_GROWTH_MONTHLY",
    label: "Growth",
    propertyLimit: 25,
    memberLimit: 40,
  },
  {
    key: "founding_annual",
    envKey: "STRIPE_PRICE_FOUNDING_ANNUAL",
    label: "Founding annual",
    propertyLimit: 10,
    memberLimit: 15,
  },
];

function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicSupabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !publicSupabaseKey || !serviceRoleKey) {
    throw new Error("Missing Supabase billing environment variables.");
  }

  return { supabaseUrl, publicSupabaseKey, serviceRoleKey };
}

function parseAccessToken(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return "";
  }

  return authorizationHeader.slice(7).trim();
}

export function createBillingServiceClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createBillingAuthClient(token: string) {
  const { supabaseUrl, publicSupabaseKey } = getSupabaseEnv();
  return createClient(supabaseUrl, publicSupabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export function getStripePlanOptions() {
  return STRIPE_PLANS.map((plan) => ({
    ...plan,
    priceId: process.env[plan.envKey]?.trim() || "",
  }));
}

export function getStripePlanByKey(planKey: string) {
  return getStripePlanOptions().find((plan) => plan.key === planKey) || null;
}

export function getStripePlanByPriceId(priceId: string | null | undefined) {
  const normalizedPriceId = String(priceId || "").trim();
  if (!normalizedPriceId) return null;
  return getStripePlanOptions().find((plan) => plan.priceId === normalizedPriceId) || null;
}

export function normalizeStripeSubscriptionStatus(status: string | null | undefined): OrganizationSubscriptionStatus {
  switch (String(status || "").trim().toLowerCase()) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "paused":
      return "suspended";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "past_due";
  }
}

export function getBillingAppUrl(requestOrigin: string) {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || requestOrigin;
}

function getStripeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

function getOrganizationIdFromStripeObject(metadata: Record<string, string> | null | undefined) {
  const organizationId = metadata?.organizationId;
  return typeof organizationId === "string" && organizationId.trim() ? organizationId.trim() : "";
}

export async function requireBillingAdminAccess(authorizationHeader: string | null, organizationId: string) {
  const accessToken = parseAccessToken(authorizationHeader);

  if (!accessToken) {
    throw new Error("Missing access token.");
  }

  const authClient = createBillingAuthClient(accessToken);
  const serviceClient = createBillingServiceClient();

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new Error("Not authenticated.");
  }

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    throw new Error("No profile was found for this user.");
  }

  if (profile.role !== "platform_admin") {
    const { data: membership, error: membershipError } = await serviceClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("profile_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error("Admin access required for this organization.");
    }
  }

  const { data: organization, error: organizationError } = await serviceClient
    .from("organizations")
    .select(
      "id,name,slug,created_by,subscription_status,stripe_customer_id,stripe_subscription_id,account_type,plan_name,property_limit,member_limit"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError || !organization) {
    throw new Error("Organization not found.");
  }

  return {
    user,
    profile,
    organization: organization as OrganizationBillingRecord,
    serviceClient,
  };
}

export async function ensureStripeCustomerForOrganization(options: {
  stripe: Stripe;
  organization: OrganizationBillingRecord;
  serviceClient: ReturnType<typeof createBillingServiceClient>;
  email: string;
  fullName?: string | null;
}) {
  if (options.organization.stripe_customer_id) {
    return options.organization.stripe_customer_id;
  }

  const customer = await options.stripe.customers.create({
    email: options.email,
    name: options.fullName?.trim() || options.organization.name || undefined,
    metadata: {
      organizationId: options.organization.id,
      organizationName: options.organization.name || options.organization.slug || "Organization",
    },
  });

  const { error } = await options.serviceClient
    .from("organizations")
    .update({
      stripe_customer_id: customer.id,
    })
    .eq("id", options.organization.id);

  if (error) {
    throw new Error(error.message);
  }

  return customer.id;
}

async function findOrganizationForStripeEvent(options: {
  serviceClient: ReturnType<typeof createBillingServiceClient>;
  organizationId?: string;
  customerId?: string | null;
}) {
  const organizationId = options.organizationId?.trim() || "";

  if (organizationId) {
    const { data, error } = await options.serviceClient
      .from("organizations")
      .select("id")
      .eq("id", organizationId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data.id;
  }

  const customerId = String(options.customerId || "").trim();
  if (!customerId) {
    return "";
  }

  const { data, error } = await options.serviceClient
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id || "";
}

export async function syncOrganizationFromStripeSubscription(options: {
  serviceClient: ReturnType<typeof createBillingServiceClient>;
  subscription: Stripe.Subscription;
}) {
  const customerId = getStripeCustomerId(options.subscription.customer);
  const organizationId = await findOrganizationForStripeEvent({
    serviceClient: options.serviceClient,
    organizationId: getOrganizationIdFromStripeObject(options.subscription.metadata),
    customerId,
  });

  if (!organizationId) {
    return;
  }

  const primaryItem = options.subscription.items.data[0];
  const priceId = primaryItem?.price?.id || "";
  const plan = getStripePlanByPriceId(priceId);
  const subscriptionStatus = normalizeStripeSubscriptionStatus(options.subscription.status);

  const updates: Record<string, unknown> = {
    account_type: "customer",
    billing_enabled: subscriptionStatus === "active" || subscriptionStatus === "past_due",
    stripe_customer_id: customerId,
    stripe_subscription_id: options.subscription.id,
    subscription_status: subscriptionStatus,
  };

  if (plan) {
    updates.plan_name = plan.label;
    updates.property_limit = plan.propertyLimit;
    updates.member_limit = plan.memberLimit;
  }

  const { error } = await options.serviceClient
    .from("organizations")
    .update(updates)
    .eq("id", organizationId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markOrganizationCheckoutStarted(options: {
  serviceClient: ReturnType<typeof createBillingServiceClient>;
  organizationId: string;
  customerId: string | null;
  subscriptionId?: string | null;
}) {
  const updates: Record<string, unknown> = {};

  if (options.customerId) {
    updates.stripe_customer_id = options.customerId;
  }

  if (options.subscriptionId) {
    updates.stripe_subscription_id = options.subscriptionId;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error } = await options.serviceClient
    .from("organizations")
    .update(updates)
    .eq("id", options.organizationId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncOrganizationFromCheckoutSession(options: {
  stripe: Stripe;
  serviceClient: ReturnType<typeof createBillingServiceClient>;
  session: Stripe.Checkout.Session;
}) {
  const organizationId = getOrganizationIdFromStripeObject(options.session.metadata);
  const customerId = getStripeCustomerId(options.session.customer);

  if (organizationId) {
    await markOrganizationCheckoutStarted({
      serviceClient: options.serviceClient,
      organizationId,
      customerId,
      subscriptionId: typeof options.session.subscription === "string" ? options.session.subscription : null,
    });
  }

  const subscriptionId =
    typeof options.session.subscription === "string"
      ? options.session.subscription
      : options.session.subscription?.id || "";

  if (!subscriptionId) {
    return;
  }

  const subscription = await options.stripe.subscriptions.retrieve(subscriptionId);
  await syncOrganizationFromStripeSubscription({
    serviceClient: options.serviceClient,
    subscription,
  });
}
