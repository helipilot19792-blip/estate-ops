type OrganizationBillingAccessRow = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  account_type?: string | null;
  plan_name?: string | null;
  property_limit?: number | null;
  member_limit?: number | null;
};

type WorkspaceBillingState = {
  accountType: string;
  isInternalWorkspace: boolean;
  subscriptionStatus: string;
  trialEnded: boolean;
  planName: string;
};

type WorkspaceBillingError = Error & {
  code: "WORKSPACE_BILLING_BLOCKED" | "WORKSPACE_LIMIT_REACHED";
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
    code: "WORKSPACE_BILLING_BLOCKED" as const,
  });
}

export function createWorkspaceLimitError(message: string): WorkspaceBillingError {
  return Object.assign(new Error(message), {
    code: "WORKSPACE_LIMIT_REACHED" as const,
  });
}

export function getWorkspaceBillingErrorStatus(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "WORKSPACE_BILLING_BLOCKED") return 402;
  if (code === "WORKSPACE_LIMIT_REACHED") return 409;
  return 500;
}

export function assertWorkspaceBillingAccess(
  organization: OrganizationBillingAccessRow | null | undefined,
  options?: { now?: Date; blockPastDue?: boolean }
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

  if (options?.blockPastDue && state.subscriptionStatus === "past_due") {
    throw createWorkspaceBillingError(
      "This workspace has an overdue subscription. Update billing before making changes."
    );
  }

  return state;
}

export async function loadWorkspaceBillingOrganization(service: any, organizationId: string) {
  const { data, error } = await service
    .from("organizations")
    .select(
      "id,subscription_status,trial_ends_at,account_type,plan_name,property_limit,member_limit"
    )
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Organization not found.");
  return data as OrganizationBillingAccessRow & { id: string };
}

export async function assertWorkspaceBillingAccessForOrganization(
  service: any,
  organizationId: string
) {
  const organization = await loadWorkspaceBillingOrganization(service, organizationId);
  return {
    organization,
    state: assertWorkspaceBillingAccess(organization, { blockPastDue: true }),
  };
}

export async function assertWorkspaceMemberCapacity(
  service: any,
  organizationId: string,
  additionalMembers = 1
) {
  const { organization, state } = await assertWorkspaceBillingAccessForOrganization(
    service,
    organizationId
  );

  if (
    state.isInternalWorkspace ||
    organization.member_limit === null ||
    organization.member_limit === undefined
  ) {
    return;
  }

  const [membersResult, invitesResult] = await Promise.all([
    service
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    service
      .from("organization_invites")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["pending", "sent"]),
  ]);

  const countError = membersResult.error || invitesResult.error;
  if (countError) throw new Error(countError.message);

  const reservedSeats = (membersResult.count ?? 0) + (invitesResult.count ?? 0);
  if (reservedSeats + Math.max(0, additionalMembers) > organization.member_limit) {
    throw createWorkspaceLimitError(
      `This workspace is at its ${organization.member_limit}-member plan limit.`
    );
  }
}
