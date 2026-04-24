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

export default function PlatformPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<PlatformProfile | null>(null);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [actingOrganizationId, setActingOrganizationId] = useState<string | null>(null);

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
      setStatusMessage(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Platform action failed.");
    } finally {
      setActingOrganizationId(null);
    }
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

        <section className="mt-6 space-y-4">
          {organizations.map((organization) => {
            const daysRemaining = getTrialDaysRemaining(organization.trial_ends_at);
            const isActing = actingOrganizationId === organization.id;

            return (
              <div
                key={organization.id}
                className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-[0_18px_45px_rgba(0,0,0,0.05)]"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
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

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a7b68]">Usage</div>
                        <div className="mt-2 text-sm font-semibold text-[#241c15]">
                          {organization.property_count} properties | {organization.cleaning_job_count + organization.grounds_job_count} jobs
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
                  </div>

                  <div className="w-full space-y-2 xl:w-[240px]">
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() =>
                        void handleAction(
                          { type: "extend_trial", organizationId: organization.id, days: 30 },
                          `Extended ${organization.name || "organization"} trial by 30 days.`
                        )
                      }
                      className="w-full rounded-full border border-[#d8c7ab] bg-[#fff8e8] px-4 py-2.5 text-sm font-medium text-[#8a6112] transition hover:bg-[#fff2cf] disabled:opacity-60"
                    >
                      {isActing ? "Working..." : "Extend trial 30 days"}
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
                      className="w-full rounded-full border border-[#cfe4cf] bg-[#f4fbf4] px-4 py-2.5 text-sm font-medium text-[#2f6b2f] transition hover:bg-[#e8f7e8] disabled:opacity-60"
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
                      className="w-full rounded-full border border-[#d8c7ab] bg-white px-4 py-2.5 text-sm font-medium text-[#5f5245] transition hover:bg-[#fcfaf7] disabled:opacity-60"
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
                      className="w-full rounded-full border border-[#efc6c6] bg-[#fff5f5] px-4 py-2.5 text-sm font-medium text-[#8a2e22] transition hover:bg-[#fff0f0] disabled:opacity-60"
                    >
                      Suspend org
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
