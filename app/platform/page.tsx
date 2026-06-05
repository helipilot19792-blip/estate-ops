"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PlatformOrganization = {
  id: string;
  name: string | null;
  slug: string | null;
  created_at?: string | null;
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  billing_enabled?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  organization_type?: "property_management" | "cleaning_company" | null;
  account_type?: string | null;
  plan_name?: string | null;
  property_limit?: number | null;
  member_limit?: number | null;
  billing_override_reason?: string | null;
  member_count: number;
  admin_count: number;
  property_count: number;
  cleaning_job_count: number;
  grounds_job_count: number;
  owner_count: number;
  admins: Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>;
};

type PlatformProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type PlatformAuditLog = {
  id: string;
  created_at?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  organization_id?: string | null;
  action_type: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type FeatureUsageSummary = {
  available: boolean;
  global: {
    total_events: number;
    unique_features: number;
    top_features: Array<FeatureUsageTopFeature>;
  };
  byOrganization: Record<
    string,
    {
      total_events: number;
      unique_features: number;
      last_used_at: string | null;
      top_features: Array<FeatureUsageTopFeature>;
    }
  >;
};

type FeatureUsageTopFeature = {
  feature_key: string;
  feature_label: string;
  portal: string;
  count: number;
  last_used_at: string | null;
};

const PORTAL_PREVIEW_LINKS = [
  {
    label: "Admin portal",
    description: "Company admin workspace with properties, jobs, owners, billing, and operations.",
    href: "/admin?portalPreview=1",
    tone: "border-[#d8c7ab] bg-[#fffdf9] text-[#5f5245]",
  },
  {
    label: "Cleaner portal",
    description: "Cleaner desktop job view for assigned work, SOPs, access, and job status.",
    href: "/cleaner?portalPreview=1",
    tone: "border-[#cfe4cf] bg-[#f4fbf4] text-[#2f6b2f]",
  },
  {
    label: "Cleaner mobile",
    description: "Phone-first cleaner flow with GPS access, arrival, SOPs, issues, and finish actions.",
    href: "/cleaner/mobile?portalPreview=1",
    tone: "border-[#cfe4cf] bg-[#f4fbf4] text-[#2f6b2f]",
  },
  {
    label: "Grounds portal",
    description: "Grounds crew jobs, route-style assignments, and progress actions.",
    href: "/grounds?portalPreview=1",
    tone: "border-[#c9dff0] bg-[#f3f9fd] text-[#24506f]",
  },
  {
    label: "Owner portal",
    description: "Owner-facing statements, invoices, property visibility, and document access.",
    href: "/owner?portalPreview=1",
    tone: "border-[#ead7f0] bg-[#fcf7ff] text-[#6f3f7c]",
  },
  {
    label: "Owner welcome",
    description: "Owner onboarding and welcome experience.",
    href: "/owner/welcome?portalPreview=1",
    tone: "border-[#ead7f0] bg-[#fcf7ff] text-[#6f3f7c]",
  },
  {
    label: "Login",
    description: "Shared sign-in entry point.",
    href: "/login",
    tone: "border-[#e7ddd0] bg-white text-[#5f5245]",
  },
  {
    label: "Invite flow",
    description: "Invite acceptance and account creation route.",
    href: "/invite",
    tone: "border-[#e7ddd0] bg-white text-[#5f5245]",
  },
  {
    label: "Help",
    description: "Support/help page as customers see it.",
    href: "/help",
    tone: "border-[#e7ddd0] bg-white text-[#5f5245]",
  },
] as const;

function getTrialDaysRemaining(trialEndsAt?: string | null) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

function getStatusTone(status?: string | null) {
  switch ((status || "").toLowerCase()) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "suspended":
      return "border-red-200 bg-red-50 text-red-700";
    case "past_due":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "canceled":
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-[#ecd7a8] bg-[#fff8e8] text-[#8a6112]";
  }
}

function getPlanLabel(organization: PlatformOrganization) {
  return organization.plan_name || (organization.account_type === "internal" ? "Internal workspace" : "Beta trial");
}

function getOrganizationTypeLabel(organization: PlatformOrganization) {
  return organization.organization_type === "cleaning_company" ? "Cleaning company" : "Property management";
}

export default function PlatformPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<PlatformProfile | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLog[]>([]);
  const [auditLogAvailable, setAuditLogAvailable] = useState(true);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsageSummary | null>(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [actingOrganizationId, setActingOrganizationId] = useState<string | null>(null);
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [organizationStatusFilter, setOrganizationStatusFilter] = useState("all");
  const [organizationTypeFilter, setOrganizationTypeFilter] = useState("all");
  const [cleaningAdminPreviewOrganization, setCleaningAdminPreviewOrganization] =
    useState<PlatformOrganization | null>(null);
  const [openingCleaningAdminPreview, setOpeningCleaningAdminPreview] = useState(false);
  const [expandedOrganizationIds, setExpandedOrganizationIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirmByOrg, setDeleteConfirmByOrg] = useState<Record<string, string>>({});
  const [auditLogExpanded, setAuditLogExpanded] = useState(false);

  async function loadPlatformData() {
    setError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.replace("/login");
      return;
    }

    const response = await fetch("/api/platform/organizations", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(payload?.error || "Could not load platform data.");
      setLoading(false);
      return;
    }

    setCurrentProfile(payload.currentProfile || null);
    setOrganizations((payload.organizations || []) as PlatformOrganization[]);
    setAuditLogs((payload.auditLogs || []) as PlatformAuditLog[]);
    setAuditLogAvailable(payload.auditLogAvailable !== false);
    setFeatureUsage((payload.featureUsage || null) as FeatureUsageSummary | null);
    setLoading(false);
  }

  useEffect(() => {
    void loadPlatformData();
  }, []);

  const totals = useMemo(() => {
    return organizations.reduce(
      (acc, organization) => {
        acc.organizations += 1;
        acc.properties += organization.property_count;
        acc.jobs += organization.cleaning_job_count + organization.grounds_job_count;
        acc.members += organization.member_count;
        return acc;
      },
      { organizations: 0, properties: 0, jobs: 0, members: 0 }
    );
  }, [organizations]);

  const filteredOrganizations = useMemo(() => {
    const query = organizationSearch.trim().toLowerCase();

    return organizations.filter((organization) => {
      const status = (organization.subscription_status || "trialing").toLowerCase();
      const admins = organization.admins
        .map((admin) => `${admin.full_name || ""} ${admin.email || ""}`)
        .join(" ")
        .toLowerCase();
      const haystack = `${organization.name || ""} ${organization.slug || ""} ${admins}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const matchesStatus = organizationStatusFilter === "all" || status === organizationStatusFilter;
      const type = organization.organization_type === "cleaning_company" ? "cleaning_company" : "property_management";
      const matchesType = organizationTypeFilter === "all" || type === organizationTypeFilter;
      return matchesQuery && matchesStatus && matchesType;
    });
  }, [organizations, organizationSearch, organizationStatusFilter, organizationTypeFilter]);

  function getDeleteConfirmationText(organization: PlatformOrganization) {
    return String(organization.name || organization.slug || organization.id).trim();
  }

  function toggleOrganizationExpanded(organizationId: string) {
    setExpandedOrganizationIds((current) => {
      const next = new Set(current);
      if (next.has(organizationId)) {
        next.delete(organizationId);
      } else {
        next.add(organizationId);
      }
      return next;
    });
  }

  async function handleAction(body: Record<string, unknown>, message: string) {
    try {
      setError("");
      setStatusMessage("");
      setActingOrganizationId(String(body.organizationId || ""));

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No active platform session.");
      }

      const response = await fetch("/api/platform/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Platform action failed.");
      }

      setOrganizations((payload.organizations || []) as PlatformOrganization[]);
      setAuditLogs((payload.auditLogs || []) as PlatformAuditLog[]);
      setAuditLogAvailable(payload.auditLogAvailable !== false);
      setFeatureUsage((payload.featureUsage || null) as FeatureUsageSummary | null);
      setStatusMessage(message);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Platform action failed.");
      return false;
    } finally {
      setActingOrganizationId(null);
    }
  }

  async function handleOpenCleaningAdminPreview() {
    try {
      setError("");
      setStatusMessage("");
      setOpeningCleaningAdminPreview(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("No active platform session.");
      }

      const response = await fetch("/api/platform/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: "ensure_cleaning_demo" }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "Could not open cleaning company demo.");
      }

      const nextOrganizations = (payload.organizations || []) as PlatformOrganization[];
      const demoOrganization =
        nextOrganizations.find((organization) => organization.id === payload.previewOrganizationId) || null;

      setOrganizations(nextOrganizations);
      setAuditLogs((payload.auditLogs || []) as PlatformAuditLog[]);
      setAuditLogAvailable(payload.auditLogAvailable !== false);
      setFeatureUsage((payload.featureUsage || null) as FeatureUsageSummary | null);
      setCleaningAdminPreviewOrganization(demoOrganization);
      setStatusMessage("Cleaning company demo opened as its own isolated organization.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open cleaning company demo.");
    } finally {
      setOpeningCleaningAdminPreview(false);
    }
  }

  async function handleDeleteOrganization(organization: PlatformOrganization) {
    const expectedText = getDeleteConfirmationText(organization);
    const confirmedText = String(deleteConfirmByOrg[organization.id] || "").trim();

    if (confirmedText !== expectedText) {
      setError(`Type "${expectedText}" to confirm this company deletion.`);
      return;
    }

    const deleted = await handleAction(
      {
        type: "delete_organization",
        organizationId: organization.id,
        confirmName: confirmedText,
      },
      `${organization.name || "Company"} and its company data were removed.`
    );

    if (!deleted) return;

    setExpandedOrganizationIds((current) => {
      const next = new Set(current);
      next.delete(organization.id);
      return next;
    });
    setDeleteConfirmByOrg((current) => {
      const next = { ...current };
      delete next[organization.id];
      return next;
    });
  }


  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f3ee] px-4 py-10 text-[#241c15]">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-[#e7ddd0] bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          <div className="text-sm text-[#6f6255]">Loading platform controls...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] px-4 py-8 text-[#241c15]">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)]">
          <div className="bg-[linear-gradient(135deg,#120f0b_0%,#1e1812_55%,#2d2115_100%)] px-6 py-8 text-white md:px-8 md:py-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">Platform Admin</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">SaaS Control Tower</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#e7dccb] md:text-base">
                  Global control across every company workspace, while leaving each tenant&apos;s admin panel isolated.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/admin")}
                  className="inline-flex items-center justify-center rounded-full border border-[#d8c7ab]/40 bg-[#fef3c7] px-5 py-2.5 text-sm font-medium text-[#7c5a10] transition hover:bg-[#fde68a]"
                >
                  Open My Admin Workspace
                </button>
                <div className="rounded-[22px] border border-white/10 bg-white/10 px-5 py-4 text-sm text-[#f7e5bf]">
                  {currentProfile?.full_name || currentProfile?.email || "Platform admin"}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#efe6dc] bg-[#fbf8f4] px-6 py-4 md:grid-cols-4 md:px-8">
            {[
              { label: "Organizations", value: totals.organizations },
              { label: "Properties", value: totals.properties },
              { label: "Jobs", value: totals.jobs },
              { label: "Members", value: totals.members },
            ].map((item) => (
              <div key={item.label} className="rounded-[24px] border border-[#eadfce] bg-white px-4 py-4 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[#8a7b68]">{item.label}</div>
                <div className="mt-2 text-3xl font-semibold text-[#241c15]">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="mt-6 rounded-[24px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
            {error}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="mt-6 rounded-[24px] border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-3 text-sm text-[#2f6b2f] shadow-sm">
            {statusMessage}
          </div>
        ) : null}

        <section className="mt-6 rounded-[28px] border border-[#d8deea] bg-[linear-gradient(135deg,#f8fbff_0%,#fffdf8_100%)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#506586]">Portal Preview</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#1f314d]">Live role portals</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#617087]">
                Open the actual current portal routes for each role. These are live pages, so code changes show here immediately after the app updates.
              </p>
            </div>
            <span className="w-fit rounded-full border border-[#c9d5ea] bg-white/80 px-3 py-1 text-xs font-semibold text-[#3c5274]">
              Current session
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button
              type="button"
              onClick={() => void handleOpenCleaningAdminPreview()}
              disabled={openingCleaningAdminPreview}
              className="group rounded-[22px] border border-[#b9d9ca] bg-[#f4fbf4] px-4 py-4 text-left text-[#2f6b55] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Cleaning admin dashboard</div>
                  <div className="mt-2 text-xs leading-5 opacity-80">
                    Open a separate demo cleaning-company organization with its own admin dashboard.
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold opacity-80 transition group-hover:opacity-100">
                  {openingCleaningAdminPreview ? "Opening" : "View"}
                </span>
              </div>
              <div className="mt-3 font-mono text-[11px] opacity-65">/admin?demo=cleaning-company</div>
            </button>

            {PORTAL_PREVIEW_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={`group rounded-[22px] border px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${link.tone}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{link.label}</div>
                    <div className="mt-2 text-xs leading-5 opacity-80">{link.description}</div>
                  </div>
                  <span className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold opacity-80 transition group-hover:opacity-100">
                    Open
                  </span>
                </div>
                <div className="mt-3 font-mono text-[11px] opacity-65">{link.href}</div>
              </a>
            ))}
          </div>

          <div className="mt-4 rounded-[18px] border border-[#c9d5ea] bg-white/70 px-4 py-3 text-xs leading-5 text-[#617087]">
            These previews do not impersonate users. Cleaner and grounds previews can show sample live UI data when your platform login is not linked to that staff role.
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-[#d7e6df] bg-[linear-gradient(135deg,#f5fbf8_0%,#fffaf1_100%)] p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4f7c6b]">Usage Insights</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17382d]">Feature adoption</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5e7469]">
                See which parts of GuleraOS are actually being opened across tenant workspaces. This tracks feature names and actions, not private invoice text, chat contents, or owner notes.
              </p>
            </div>
            <span className="rounded-full border border-[#b9d9ca] bg-white/80 px-3 py-1 text-xs font-semibold text-[#2f6b55]">
              Last 30 days
            </span>
          </div>

          {featureUsage?.available === false ? (
            <div className="mt-5 rounded-[22px] border border-[#ecd7a8] bg-[#fff8e8] px-4 py-5 text-sm text-[#8a6112]">
              Usage tracking is installed in the app, but the database table is missing. Run{" "}
              <span className="font-mono">supabase/add_feature_usage_events.sql</span> in Supabase SQL Editor.
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-[22px] border border-[#cfe4d9] bg-white/85 px-4 py-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#6a8a7d]">Events tracked</div>
                  <div className="mt-2 text-3xl font-semibold text-[#17382d]">
                    {featureUsage?.global.total_events || 0}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#cfe4d9] bg-white/85 px-4 py-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#6a8a7d]">Features used</div>
                  <div className="mt-2 text-3xl font-semibold text-[#17382d]">
                    {featureUsage?.global.unique_features || 0}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[#cfe4d9] bg-white/85 px-4 py-4 shadow-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[#6a8a7d]">Top feature</div>
                  <div className="mt-2 text-lg font-semibold text-[#17382d]">
                    {featureUsage?.global.top_features[0]?.feature_label || "No usage yet"}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {(featureUsage?.global.top_features || []).length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-[#b9d9ca] bg-white/60 px-4 py-5 text-sm text-[#6a8a7d]">
                    No feature usage has been recorded yet. Open a few tenant workspaces after running the SQL and this will start filling in.
                  </div>
                ) : null}

                {(featureUsage?.global.top_features || []).map((feature) => (
                  <div key={`${feature.portal}-${feature.feature_key}`} className="rounded-[20px] border border-[#cfe4d9] bg-white/85 px-4 py-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-[#17382d]">{feature.feature_label}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6a8a7d]">{feature.portal}</div>
                      </div>
                      <span className="rounded-full border border-[#b9d9ca] bg-[#eef8f2] px-3 py-1 text-xs font-semibold text-[#2f6b55]">
                        {feature.count}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[#6a8a7d]">
                      Last used {feature.last_used_at ? new Date(feature.last_used_at).toLocaleString() : "not yet"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="mt-6 rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8a7b68]">Company Directory</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#241c15]">Manage companies</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f6255]">
                Search, filter, expand only the tenant you need, and remove test companies when they are no longer useful.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExpandedOrganizationIds(new Set(filteredOrganizations.map((organization) => organization.id)))}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7]"
              >
                Expand shown
              </button>
              <button
                type="button"
                onClick={() => setExpandedOrganizationIds(new Set())}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7]"
              >
                Collapse all
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_120px]">
            <input
              type="search"
              value={organizationSearch}
              onChange={(event) => setOrganizationSearch(event.target.value)}
              placeholder="Search company, slug, or admin"
              className="w-full rounded-full border border-[#d8c7ab] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition focus:border-[#b99349] focus:ring-4 focus:ring-[#f0dfbc]"
            />
            <select
              value={organizationStatusFilter}
              onChange={(event) => setOrganizationStatusFilter(event.target.value)}
              className="w-full rounded-full border border-[#d8c7ab] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition focus:border-[#b99349] focus:ring-4 focus:ring-[#f0dfbc]"
            >
              <option value="all">All statuses</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="suspended">Suspended</option>
              <option value="canceled">Canceled</option>
            </select>
            <select
              value={organizationTypeFilter}
              onChange={(event) => setOrganizationTypeFilter(event.target.value)}
              className="w-full rounded-full border border-[#d8c7ab] bg-[#fffdf9] px-4 py-3 text-sm outline-none transition focus:border-[#b99349] focus:ring-4 focus:ring-[#f0dfbc]"
            >
              <option value="all">All org types</option>
              <option value="property_management">Property management</option>
              <option value="cleaning_company">Cleaning companies</option>
            </select>
            <div className="flex items-center justify-center rounded-full border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#5f5245]">
              {filteredOrganizations.length} shown
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-4">
          {filteredOrganizations.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[#d8c7ab] bg-white px-5 py-8 text-sm text-[#7f7263]">
              No companies match the current search and status filter.
            </div>
          ) : null}

          {filteredOrganizations.map((organization) => {
            const daysRemaining = getTrialDaysRemaining(organization.trial_ends_at);
            const isActing = actingOrganizationId === organization.id;
            const usage = featureUsage?.byOrganization?.[organization.id] || null;
            const isExpanded = expandedOrganizationIds.has(organization.id);
            const deleteConfirmationText = getDeleteConfirmationText(organization);
            const deleteValue = deleteConfirmByOrg[organization.id] || "";
            const jobCount = organization.cleaning_job_count + organization.grounds_job_count;

            return (
              <div
                key={organization.id}
                className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold tracking-tight text-[#241c15]">
                        {organization.name || "Unnamed organization"}
                      </h2>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${getStatusTone(organization.subscription_status)}`}>
                        {organization.subscription_status || "trialing"}
                      </span>
                    </div>

                    <div className="mt-2 text-sm text-[#7f7263]">
                      Slug: {organization.slug || "No slug"} | Created{" "}
                      {organization.created_at ? new Date(organization.created_at).toLocaleDateString() : "Unknown"}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#5f5245]">
                      <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1">
                        {organization.property_count} properties
                      </span>
                      <span className="rounded-full border border-[#d7e6df] bg-[#f6fbf8] px-3 py-1">
                        {getPlanLabel(organization)}
                      </span>
                      <span className="rounded-full border border-[#c9dff0] bg-[#f3f9fd] px-3 py-1">
                        {getOrganizationTypeLabel(organization)}
                      </span>
                      {typeof organization.property_limit === "number" ? (
                        <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1">
                          {organization.property_count}/{organization.property_limit} property limit
                        </span>
                      ) : null}
                      <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1">
                        {jobCount} jobs
                      </span>
                      <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1">
                        {organization.member_count} members
                      </span>
                      <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1">
                        {usage ? `${usage.total_events} feature events` : "No feature usage"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleOrganizationExpanded(organization.id)}
                    className="rounded-full border border-[#d8c7ab] bg-[#241c15] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a2d23]"
                  >
                    {isExpanded ? "Collapse" : "Manage"}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-5 border-t border-[#efe6dc] pt-5">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Trial</div>
                        <div className="mt-2 text-sm font-semibold text-[#241c15]">
                          {organization.trial_ends_at
                            ? daysRemaining === null
                              ? new Date(organization.trial_ends_at).toLocaleDateString()
                              : daysRemaining < 0
                                ? `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} ago`
                                : daysRemaining === 0
                                  ? "Ends today"
                                  : `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
                            : "No trial date"}
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Plan</div>
                        <div className="mt-2 text-sm font-semibold text-[#241c15]">
                          {getPlanLabel(organization)}
                        </div>
                        <div className="mt-1 text-xs text-[#7f7263]">
                          {organization.account_type || "beta"} | {getOrganizationTypeLabel(organization)}
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Members</div>
                        <div className="mt-2 text-sm font-semibold text-[#241c15]">
                          {organization.member_count} total | {organization.admin_count} admins
                        </div>
                      </div>

                      <div className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Owners</div>
                        <div className="mt-2 text-sm font-semibold text-[#241c15]">
                          {organization.owner_count} owner account{organization.owner_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[#eadfce] bg-[#fffdf9] px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Tenant admins</div>
                      <div className="mt-2 text-sm text-[#5f5245]">
                        {organization.admins.length > 0
                          ? organization.admins
                              .map((admin) => admin.full_name || admin.email || admin.id)
                              .join(", ")
                          : "No tenant admins found"}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[#d7e6df] bg-[#f6fbf8] px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.18em] text-[#4f7c6b]">Feature usage</div>
                          <div className="mt-1 text-sm font-semibold text-[#17382d]">
                            {usage
                              ? `${usage.total_events} event${usage.total_events === 1 ? "" : "s"} | ${usage.unique_features} feature${usage.unique_features === 1 ? "" : "s"}`
                              : "No usage tracked yet"}
                          </div>
                        </div>
                        <div className="text-xs text-[#6a8a7d]">
                          {usage?.last_used_at ? `Last used ${new Date(usage.last_used_at).toLocaleDateString()}` : "Waiting for activity"}
                        </div>
                      </div>

                      {usage?.top_features?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {usage.top_features.map((feature) => (
                            <span
                              key={`${organization.id}-${feature.portal}-${feature.feature_key}`}
                              className="rounded-full border border-[#b9d9ca] bg-white px-3 py-1 text-xs font-medium text-[#2f6b55]"
                            >
                              {feature.feature_label} ({feature.count})
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="rounded-[22px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-4">
                        <div className="text-sm font-semibold text-[#241c15]">Status controls</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                { type: "extend_trial", organizationId: organization.id, days: 30 },
                                `Extended ${organization.name || "organization"} trial by 30 days.`
                              )
                            }
                            className="rounded-full border border-[#d8c7ab] bg-[#fff8e8] px-4 py-2.5 text-sm font-medium text-[#8a6112] transition hover:bg-[#fff2cf] disabled:opacity-60"
                          >
                            {isActing ? "Working..." : "Extend 30 days"}
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                { type: "set_status", organizationId: organization.id, status: "active" },
                                `${organization.name || "Organization"} marked active.`
                              )
                            }
                            className="rounded-full border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-2.5 text-sm font-medium text-[#2f6b2f] transition hover:bg-[#e8f7e8] disabled:opacity-60"
                          >
                            Mark active
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                { type: "set_status", organizationId: organization.id, status: "trialing" },
                                `${organization.name || "Organization"} moved back to trialing.`
                              )
                            }
                            className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-white disabled:opacity-60"
                          >
                            Set trialing
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                { type: "set_status", organizationId: organization.id, status: "suspended" },
                                `${organization.name || "Organization"} marked suspended.`
                              )
                            }
                            className="rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                          >
                            Suspend
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-[#d7e6df] bg-[#f6fbf8] px-4 py-4">
                        <div className="text-sm font-semibold text-[#17382d]">Plan controls</div>
                        <p className="mt-1 text-xs leading-5 text-[#5e7469]">
                          These are manual beta controls for limits and internal workspaces. Stripe can be connected later.
                        </p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                {
                                  type: "set_plan",
                                  organizationId: organization.id,
                                  accountType: "internal",
                                  planName: "Internal workspace",
                                  status: "active",
                                  billingOverrideReason: "Developer/company owner workspace",
                                },
                                `${organization.name || "Organization"} marked internal.`
                              )
                            }
                            className="rounded-full border border-[#b9d9ca] bg-white px-4 py-2.5 text-sm font-medium text-[#2f6b55] transition hover:bg-[#eef8f2] disabled:opacity-60"
                          >
                            Mark internal
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                {
                                  type: "set_plan",
                                  organizationId: organization.id,
                                  accountType: "beta",
                                  planName: "Beta Starter",
                                  propertyLimit: 10,
                                  memberLimit: 15,
                                  status: "trialing",
                                },
                                `${organization.name || "Organization"} set to Beta Starter.`
                              )
                            }
                            className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                          >
                            Beta Starter
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                {
                                  type: "set_plan",
                                  organizationId: organization.id,
                                  accountType: "beta",
                                  planName: "Beta Growth",
                                  propertyLimit: 20,
                                  memberLimit: 30,
                                  status: "trialing",
                                },
                                `${organization.name || "Organization"} set to Beta Growth.`
                              )
                            }
                            className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:opacity-60"
                          >
                            Beta Growth
                          </button>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() =>
                              void handleAction(
                                {
                                  type: "set_plan",
                                  organizationId: organization.id,
                                  accountType: "customer",
                                  planName: "Active customer",
                                  propertyLimit: organization.property_limit ?? 10,
                                  memberLimit: organization.member_limit ?? 15,
                                  status: "active",
                                },
                                `${organization.name || "Organization"} marked as an active customer.`
                              )
                            }
                            className="rounded-full border border-[#cfe4cf] bg-white px-4 py-2.5 text-sm font-medium text-[#2f6b2f] transition hover:bg-[#eef8f2] disabled:opacity-60"
                          >
                            Active customer
                          </button>
                        </div>
                      </div>

                      <div className="rounded-[22px] border border-[#efc6c6] bg-[#fff5f5] px-4 py-4">
                        <div className="text-sm font-semibold text-[#8a2e22]">Delete company data</div>
                        <p className="mt-1 text-xs leading-5 text-[#8a2e22]">
                          Removes this company workspace and tenant records. Auth user accounts are left alone.
                        </p>
                        <input
                          type="text"
                          value={deleteValue}
                          onChange={(event) =>
                            setDeleteConfirmByOrg((current) => ({
                              ...current,
                              [organization.id]: event.target.value,
                            }))
                          }
                          placeholder={`Type ${deleteConfirmationText}`}
                          className="mt-3 w-full rounded-full border border-[#efc6c6] bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[#d94a4a] focus:ring-4 focus:ring-[#ffe0e0]"
                        />
                        <button
                          type="button"
                          disabled={isActing || deleteValue.trim() !== deleteConfirmationText}
                          onClick={() => void handleDeleteOrganization(organization)}
                          className="mt-3 w-full rounded-full border border-[#e08b8b] bg-[#d93d3d] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b72f2f] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isActing ? "Deleting..." : "Delete company"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#241c15]">Recent Audit Log</h2>
              <p className="mt-1 text-sm text-[#7f7263]">
                {auditLogAvailable
                  ? "High-impact platform and admin actions across the SaaS."
                  : "Run the audit log SQL migration in Supabase to turn this on."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-[#eadfce] bg-[#fcfaf7] px-3 py-1 text-xs font-medium text-[#7f7263]">
                {auditLogs.length}
              </span>
              <button
                type="button"
                onClick={() => setAuditLogExpanded((current) => !current)}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7]"
              >
                {auditLogExpanded ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {auditLogExpanded ? (
          <div className="mt-5 space-y-3">
            {!auditLogAvailable ? (
              <div className="rounded-[22px] border border-[#ecd7a8] bg-[#fff8e8] px-4 py-5 text-sm text-[#8a6112]">
                Audit logging is installed in the app, but the database table is missing. Run{" "}
                <span className="font-mono">supabase/add_audit_logs.sql</span> in Supabase SQL Editor.
              </div>
            ) : null}

            {auditLogs.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-[#d8c7ab] bg-[#fcfaf7] px-4 py-5 text-sm text-[#8a7b68]">
                No audit log entries yet.
              </div>
            ) : null}

            {auditLogs.map((entry) => {
              const organization = organizations.find((item) => item.id === entry.organization_id);
              return (
                <div
                  key={entry.id}
                  className="rounded-[20px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-4"
                >
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#241c15]">{entry.action_type}</div>
                      <div className="mt-1 text-sm text-[#6f6255]">
                        {(entry.actor_email || entry.actor_role || "Unknown actor")} on{" "}
                        {organization?.name || entry.organization_id || "platform"}
                      </div>
                      <div className="mt-1 text-xs text-[#8a7b68]">
                        Target: {entry.target_type || "n/a"} {entry.target_id ? `| ${entry.target_id}` : ""}
                      </div>
                      {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                        <div className="mt-2 rounded-[14px] border border-[#eadfce] bg-white px-3 py-2 font-mono text-xs text-[#6f6255]">
                          {JSON.stringify(entry.metadata)}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-xs text-[#8a7b68]">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : "Unknown time"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          ) : null}
        </section>
      </div>

      {cleaningAdminPreviewOrganization ? (
        <div className="fixed inset-0 z-50 bg-[#241c15]/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[28px] border border-[#d8c7ab] bg-[#fffdf9] shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-3 border-b border-[#eadfce] px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2f6b55]">
                  Cleaning admin viewer
                </div>
                <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-[#241c15]">
                  {cleaningAdminPreviewOrganization.name || cleaningAdminPreviewOrganization.slug || "Cleaning company"}
                </h2>
                <p className="mt-1 text-sm text-[#7f7263]">
                  Live admin dashboard for the isolated cleaning-company demo organization.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/admin?portalPreview=1&organizationId=${encodeURIComponent(cleaningAdminPreviewOrganization.id)}&open=jobs`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#5f5245] transition hover:bg-[#fcfaf7]"
                >
                  Open full tab
                </a>
                <button
                  type="button"
                  onClick={() => setCleaningAdminPreviewOrganization(null)}
                  className="rounded-full border border-[#241c15] bg-[#241c15] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#3a2d23]"
                >
                  Close viewer
                </button>
              </div>
            </div>

            <iframe
              title={`Cleaning admin dashboard for ${
                cleaningAdminPreviewOrganization.name || cleaningAdminPreviewOrganization.id
              }`}
              src={`/admin?portalPreview=1&organizationId=${encodeURIComponent(cleaningAdminPreviewOrganization.id)}&open=jobs`}
              className="min-h-0 flex-1 border-0 bg-white"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
