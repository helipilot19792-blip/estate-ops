type OrganizationBillingAccessRow = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  account_type?: string | null;
  plan_name?: string | null;
};

type WorkspaceBillingState = {
  accountType: string;
  isInternalWorkspace: boolean;
  subscriptionStatus: string;
  trialEnded: boolean;
  planName: string;
};

type WorkspaceBillingError = Error & {
  code: "TRIAL_ENDED";
};

export function getWorkspaceBillingState(
  organization: OrganizationBillingAccessRow | null | undefined,
  now = new Date()
): WorkspaceBillingState {
  const accountType = String(organization?.account_type || "beta").trim().toLowerCase();
  const isInternalWorkspace = accountType === "internal";
  const subscriptionStatus = String(organization?.subscription_status || "trialing")
    .trim()
    .toLowerCase();
  const trialEndsAt = organization?.trial_ends_at ? new Date(organization.trial_ends_at) : null;
  const trialEnded =
    !isInternalWorkspace &&
    subscriptionStatus === "trialing" &&
    !!trialEndsAt &&
    !Number.isNaN(trialEndsAt.getTime()) &&
    trialEndsAt.getTime() < now.getTime();

  return {
    accountType,
    isInternalWorkspace,
    subscriptionStatus,
    trialEnded,
    planName: organization?.plan_name?.trim() || (isInternalWorkspace ? "Internal workspace" : "Beta trial"),
  };
}

export function createWorkspaceBillingError(message: string): WorkspaceBillingError {
  return Object.assign(new Error(message), {
    code: "TRIAL_ENDED" as const,
  });
}

export function assertWorkspaceBillingAccess(
  organization: OrganizationBillingAccessRow | null | undefined,
  options?: { now?: Date }
) {
  const state = getWorkspaceBillingState(organization, options?.now);

  if (state.trialEnded) {
    throw createWorkspaceBillingError(
      "This workspace trial has ended. Upgrade in billing to continue using the admin portal."
    );
  }

  if (state.subscriptionStatus === "canceled" || state.subscriptionStatus === "suspended") {
    throw createWorkspaceBillingError(
      "This workspace is not active. Update billing to continue using the admin portal."
    );
  }

  return state;
}
