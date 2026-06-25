"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/components/i18n-provider";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy";

type AccountProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at?: string | null;
};

type AccountPayload = {
  ok?: boolean;
  error?: string;
  user?: {
    id: string;
    email: string | null;
  };
  profile?: AccountProfile | null;
  identity?: AccountIdentity | null;
  organizationBilling?: AccountOrganizationBilling | null;
};

type AccountIdentity = {
  source: "profile" | "owner_account" | "cleaner_account" | "grounds_account";
  portal: string;
  id: string;
  role: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  organization_id?: string | null;
};

type AccountOrganizationBilling = {
  organization_id: string;
  name: string | null;
  account_type: string | null;
  subscription_status: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
};

const ADMIN_SELECTED_ORGANIZATION_KEY = "admin-current-organization-id-v2";

function getPortalFromPath(pathname: string): string {
  if (pathname.startsWith("/owner")) return "owner";
  if (pathname.startsWith("/cleaner")) return "cleaner";
  if (pathname.startsWith("/grounds")) return "grounds";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/platform")) return "platform";
  return "account";
}

export default function MyAccountControl() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useI18n();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [organizationBilling, setOrganizationBilling] = useState<AccountOrganizationBilling | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionConfirmed, setDeletionConfirmed] = useState(false);
  const [requestingDeletion, setRequestingDeletion] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canSaveProfile = useMemo(
    () => !savingProfile && !loading && (fullName.trim() !== (identity?.full_name || "") || phone.trim() !== (identity?.phone || "")),
    [fullName, identity?.full_name, identity?.phone, loading, phone, savingProfile]
  );
  const portal = getPortalFromPath(pathname || "");

  function getCurrentAdminOrganizationId() {
    if (typeof window === "undefined") return "";
    const fromUrl = new URLSearchParams(window.location.search).get("organizationId")?.trim() || "";
    if (fromUrl) return fromUrl;
    return window.localStorage.getItem(ADMIN_SELECTED_ORGANIZATION_KEY)?.trim() || "";
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
      if (!session) {
        setOpen(false);
        setProfile(null);
        setIdentity(null);
        setOrganizationBilling(null);
        setAuthEmail("");
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function loadAccount() {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t("myAccount.errors.notSignedIn"));
      }

      const organizationId =
        portal === "admin" || portal === "platform" ? getCurrentAdminOrganizationId() : "";
      const response = await fetch(
        `/api/my-account?portal=${encodeURIComponent(portal)}${
          organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""
        }`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const data = (await response.json().catch(() => null)) as AccountPayload | null;

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || t("myAccount.errors.loadFailed"));
      }

      setProfile(data?.profile || null);
      setIdentity(data?.identity || null);
      setOrganizationBilling(data?.organizationBilling || null);
      setAuthEmail(data?.identity?.email || data?.user?.email || data?.profile?.email || "");
      setFullName(data?.identity?.full_name || data?.profile?.full_name || "");
      setPhone(data?.identity?.phone || data?.profile?.phone || "");
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : t("myAccount.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function openAccount() {
    setOpen(true);
    await loadAccount();
  }

  async function openBillingPortal() {
    setSavingProfile(true);
    setError("");
    setMessage("");

    try {
      const organizationId = organizationBilling?.organization_id || getCurrentAdminOrganizationId();

      if (!organizationId) {
        throw new Error("Select an admin workspace before opening billing.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t("myAccount.errors.notSignedIn"));
      }

      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ organizationId }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Could not open billing.");
      }

      window.location.href = data.url;
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : "Could not open billing.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t("myAccount.errors.notSignedIn"));
      }

      const response = await fetch("/api/my-account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName,
          phone,
          portal,
        }),
      });
      const data = (await response.json().catch(() => null)) as AccountPayload | null;

      if (!response.ok || data?.ok === false || !data?.profile) {
        throw new Error(data?.error || t("myAccount.errors.saveFailed"));
      }

      setProfile(data.profile);
      setIdentity(data.identity || null);
      setFullName(data.identity?.full_name || data.profile.full_name || "");
      setPhone(data.identity?.phone || data.profile.phone || "");
      setMessage(t("myAccount.saved"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("myAccount.errors.saveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPassword(true);
    setError("");
    setMessage("");

    try {
      const passwordError = validatePassword(newPassword);
      if (passwordError) throw new Error(passwordError);
      if (newPassword !== confirmPassword) throw new Error(t("myAccount.errors.passwordMismatch"));

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error(updateError.message);

      setNewPassword("");
      setConfirmPassword("");
      setMessage(t("myAccount.passwordSaved"));
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : t("myAccount.errors.passwordFailed"));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeletionRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestingDeletion(true);
    setError("");
    setMessage("");

    try {
      if (!deletionConfirmed) {
        throw new Error(t("myAccount.privacy.confirmRequired"));
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t("myAccount.errors.notSignedIn"));
      }

      const response = await fetch("/api/my-account/deletion-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          reason: deletionReason,
          confirmed: deletionConfirmed,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error || t("myAccount.privacy.requestFailed"));
      }

      setDeletionReason("");
      setDeletionConfirmed(false);
      setMessage(data?.alreadyOpen ? t("myAccount.privacy.alreadyOpen") : t("myAccount.privacy.requestSubmitted"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("myAccount.privacy.requestFailed"));
    } finally {
      setRequestingDeletion(false);
    }
  }

  if (!signedIn) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => void openAccount()}
        className="rounded-full border border-[#d8c7ab] bg-white px-3 py-2 text-sm font-semibold text-[#241c15] outline-none transition hover:bg-[#fcfaf7] focus:border-[#b48d4e]"
      >
        {t("myAccount.button")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#241c15]/45 p-4 backdrop-blur-sm">
          <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[#e7ddd0] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.24)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#eadfce] bg-[#fcfaf7] px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a7b68]">{t("myAccount.kicker")}</p>
                <h2 className="mt-1 text-2xl font-semibold text-[#241c15]">{t("myAccount.title")}</h2>
                <p className="mt-1 text-sm text-[#6f6255]">{t("myAccount.subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#d8c7ab] bg-white px-4 py-2 text-sm font-semibold text-[#6f6255] transition hover:bg-[#fcfaf7]"
              >
                {t("myAccount.close")}
              </button>
            </div>

            <div className="space-y-5 p-5">
              {loading ? (
                <div className="rounded-[20px] border border-[#dbeafe] bg-[#f8fbff] px-4 py-3 text-sm text-[#1d4ed8]">
                  {t("myAccount.loading")}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-[20px] border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#991b1b]">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="rounded-[20px] border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm text-[#15803d]">
                  {message}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    {t("myAccount.email")}
                  </div>
                  <div className="mt-1 break-all text-sm font-semibold text-[#241c15]">{authEmail || "-"}</div>
                </div>
                <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    {t("myAccount.role")}
                  </div>
                  <div className="mt-1 text-sm font-semibold capitalize text-[#241c15]">{identity?.role || profile?.role || "-"}</div>
                </div>
                <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                    {t("myAccount.accountId")}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-[#241c15]">{identity?.id || profile?.id || "-"}</div>
                </div>
              </div>

              {portal === "admin" || portal === "platform" ? (
                <section className="rounded-[22px] border border-[#eadfce] p-4">
                  <h3 className="text-base font-semibold text-[#241c15]">Billing</h3>
                  <p className="mt-1 text-sm text-[#6f6255]">
                    Manage your workspace subscription in Stripe. Cancellation, payment methods, and invoices live there.
                  </p>
                  {organizationBilling ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                            Workspace
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#241c15]">
                            {organizationBilling.name || "Current workspace"}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                            Status
                          </div>
                          <div className="mt-1 text-sm font-semibold capitalize text-[#241c15]">
                            {organizationBilling.account_type === "internal"
                              ? "Internal"
                              : organizationBilling.subscription_status || "trialing"}
                          </div>
                        </div>
                        <div className="rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7b68]">
                            Plan
                          </div>
                          <div className="mt-1 text-sm font-semibold text-[#241c15]">
                            {organizationBilling.plan_name || "Beta trial"}
                          </div>
                        </div>
                      </div>

                      {organizationBilling.account_type === "internal" ? (
                        <div className="mt-4 rounded-[18px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                          This internal workspace does not use customer billing.
                        </div>
                      ) : organizationBilling.stripe_customer_id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void openBillingPortal()}
                            disabled={savingProfile}
                            className="mt-4 rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingProfile ? "Opening billing..." : "Manage subscription in Stripe"}
                          </button>
                          <p className="mt-2 text-xs text-[#6f6255]">
                            Customers can update cards or cancel from the Stripe billing portal.
                          </p>
                        </>
                      ) : (
                        <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                          Billing setup starts from the admin workspace banner during trial or upgrade.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 rounded-[18px] border border-[#eadfce] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                      Choose an admin workspace first to view billing details.
                    </div>
                  )}
                </section>
              ) : null}

              <section className="rounded-[22px] border border-[#eadfce] p-4">
                <h3 className="text-base font-semibold text-[#241c15]">{t("myAccount.languageTitle")}</h3>
                <label className="mt-4 block text-sm font-semibold text-[#5f5245]">
                  <span>{t("myAccount.preferredLanguage")}</span>
                  <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as Locale)}
                    className="mt-1 w-full rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm font-semibold text-[#241c15] outline-none transition focus:border-[#b48d4e]"
                  >
                    {SUPPORTED_LOCALES.map((option) => (
                      <option key={option} value={option}>
                        {LOCALE_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </section>

              <form onSubmit={handleProfileSubmit} className="rounded-[22px] border border-[#eadfce] p-4">
                <h3 className="text-base font-semibold text-[#241c15]">{t("myAccount.profileTitle")}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-[#5f5245]">
                    <span>{t("myAccount.fullName")}</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="mt-1 w-full rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm text-[#241c15] outline-none transition focus:border-[#b48d4e]"
                    />
                  </label>
                  <label className="text-sm font-semibold text-[#5f5245]">
                    <span>{t("myAccount.phone")}</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className="mt-1 w-full rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm text-[#241c15] outline-none transition focus:border-[#b48d4e]"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={!canSaveProfile}
                  className="mt-4 rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#352a21] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingProfile ? t("myAccount.saving") : t("myAccount.saveProfile")}
                </button>
              </form>

              <form onSubmit={handlePasswordSubmit} className="rounded-[22px] border border-[#eadfce] p-4">
                <h3 className="text-base font-semibold text-[#241c15]">{t("myAccount.passwordTitle")}</h3>
                <p className="mt-1 text-sm text-[#6f6255]">{PASSWORD_REQUIREMENTS}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-[#5f5245]">
                    <span>{t("myAccount.newPassword")}</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="mt-1 w-full rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm text-[#241c15] outline-none transition focus:border-[#b48d4e]"
                    />
                  </label>
                  <label className="text-sm font-semibold text-[#5f5245]">
                    <span>{t("myAccount.confirmPassword")}</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-1 w-full rounded-[16px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm text-[#241c15] outline-none transition focus:border-[#b48d4e]"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={savingPassword || !newPassword || !confirmPassword}
                  className="mt-4 rounded-full border border-[#d8c7ab] bg-[#fcfaf7] px-5 py-2.5 text-sm font-semibold text-[#241c15] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPassword ? t("myAccount.saving") : t("myAccount.updatePassword")}
                </button>
              </form>

              <form onSubmit={handleDeletionRequestSubmit} className="rounded-[22px] border border-[#fecaca] bg-[#fff8f8] p-4">
                <h3 className="text-base font-semibold text-[#991b1b]">{t("myAccount.privacy.title")}</h3>
                <p className="mt-1 text-sm leading-6 text-[#7f1d1d]">{t("myAccount.privacy.body")}</p>
                <p className="mt-2 text-sm leading-6 text-[#7f1d1d]">{t("myAccount.privacy.retention")}</p>
                <label className="mt-4 block text-sm font-semibold text-[#7f1d1d]">
                  <span>{t("myAccount.privacy.reason")}</span>
                  <textarea
                    value={deletionReason}
                    onChange={(event) => setDeletionReason(event.target.value)}
                    placeholder={t("myAccount.privacy.reasonPlaceholder")}
                    className="mt-1 min-h-24 w-full rounded-[16px] border border-[#fecaca] bg-white px-4 py-3 text-sm text-[#241c15] outline-none transition focus:border-[#ef4444]"
                  />
                </label>
                <label className="mt-3 flex items-start gap-3 rounded-[16px] border border-[#fecaca] bg-white px-4 py-3 text-sm font-medium text-[#7f1d1d]">
                  <input
                    type="checkbox"
                    checked={deletionConfirmed}
                    onChange={(event) => setDeletionConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>{t("myAccount.privacy.confirm")}</span>
                </label>
                <button
                  type="submit"
                  disabled={requestingDeletion || !deletionConfirmed}
                  className="mt-4 rounded-full bg-[#991b1b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7f1d1d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {requestingDeletion ? t("myAccount.privacy.requesting") : t("myAccount.privacy.requestButton")}
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
