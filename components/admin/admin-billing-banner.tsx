"use client";

type OrganizationBillingRow = {
  trial_ends_at?: string | null;
};

type BillingPlanKey = "starter_monthly" | "growth_monthly" | "founding_annual";

type BillingPlanOption = {
  key: BillingPlanKey;
  label: string;
  detail: string;
};

type AdminBillingBannerProps = {
  currentOrganizationBilling: OrganizationBillingRow;
  currentTrialStatus: string;
  currentPlanName: string;
  trialExpired: boolean;
  trialEndingSoon: boolean;
  trialDaysRemaining: number | null;
  hasStripeManagedSubscription: boolean;
  hasStripeBillingProfile: boolean;
  billingActionLoading: string | null;
  billingPlanOptions: BillingPlanOption[];
  formatLongDate: (date: Date) => string;
  onCheckout: (planKey: BillingPlanKey) => void;
  onOpenBillingPortal: () => void;
};

export default function AdminBillingBanner({
  currentOrganizationBilling,
  currentTrialStatus,
  currentPlanName,
  trialExpired,
  trialEndingSoon,
  trialDaysRemaining,
  hasStripeManagedSubscription,
  hasStripeBillingProfile,
  billingActionLoading,
  billingPlanOptions,
  formatLongDate,
  onCheckout,
  onOpenBillingPortal,
}: AdminBillingBannerProps) {
  return (
    <div
      className={`mb-6 rounded-[24px] border px-4 py-4 shadow-sm ${
        trialExpired
          ? "border-[#f5c2c7] bg-[#fff1f2] text-[#8a2e22]"
          : trialEndingSoon
            ? "border-[#ecd7a8] bg-[#fff8e8] text-[#8a6112]"
            : "border-[#d8c7ab] bg-[#fcfaf7] text-[#5f5245]"
      }`}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em]">
            {currentTrialStatus === "active"
              ? "Billing Ready"
              : trialExpired
                ? "Trial Ended"
                : "Free Trial"}
          </div>
          <div className="mt-1 text-sm leading-6">
            {currentTrialStatus === "active"
              ? "This workspace has Stripe billing connected."
              : trialExpired
                ? "This organization’s free trial has ended. Choose a Stripe plan below to keep billing in one secure place."
                : trialDaysRemaining === null
                  ? "This organization is in trial mode. When you are ready, you can start Stripe billing below."
                  : trialDaysRemaining === 0
                    ? "This organization’s free trial ends today."
                    : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in the free trial.`}
          </div>
          <div className="mt-1 text-xs opacity-80">
            Status: {currentTrialStatus} | Plan: {currentPlanName}
            {currentOrganizationBilling.trial_ends_at
              ? ` • Trial ends ${formatLongDate(new Date(currentOrganizationBilling.trial_ends_at))}`
              : ""}
          </div>
        </div>

        <div className="rounded-full border border-current/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em]">
          {currentPlanName}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-current/10 pt-4">
        <div className="text-xs uppercase tracking-[0.16em] opacity-75">Secure billing</div>
        <div className="flex flex-wrap gap-2">
          {!hasStripeManagedSubscription
            ? billingPlanOptions.map((plan) => {
                const isLoading = billingActionLoading === `checkout:${plan.key}`;

                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => onCheckout(plan.key)}
                    disabled={billingActionLoading !== null}
                    className="inline-flex items-center gap-2 rounded-full border border-current/20 bg-white/70 px-4 py-2 text-sm font-semibold text-current transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{isLoading ? "Opening Stripe..." : plan.label}</span>
                    <span className="text-xs font-medium opacity-70">{plan.detail}</span>
                  </button>
                );
              })
            : null}

          {hasStripeBillingProfile ? (
            <button
              type="button"
              onClick={onOpenBillingPortal}
              disabled={billingActionLoading !== null}
              className="inline-flex items-center gap-2 rounded-full border border-current/20 px-4 py-2 text-sm font-semibold text-current transition hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {billingActionLoading === "portal" ? "Opening portal..." : "Manage billing"}
            </button>
          ) : null}
        </div>
        <div className="text-xs opacity-75">
          Payments stay inside Stripe, so card handling never lives in your admin portal.
        </div>
      </div>
    </div>
  );
}
