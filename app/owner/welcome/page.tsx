"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import type { TranslationPath } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";

type OwnerAccountRow = {
  id: string;
  email: string;
  full_name: string | null;
  profile_id?: string | null;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  is_active: boolean;
};

type OwnerPropertyAccessRow = {
  id: string;
  owner_account_id: string;
  property_id: string;
};

type PropertyRow = {
  id: string;
  name: string | null;
  address: string | null;
};

function getCityFromAddress(address?: string | null) {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address;
}

function getSupabaseInviteError(t: (path: TranslationPath) => string) {
  if (typeof window === "undefined" || !window.location.hash) return "";

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorCode = hashParams.get("error_code");
  const errorDescription = hashParams.get("error_description");

  if (!errorCode && !errorDescription) return "";

  if (errorCode === "otp_expired") {
    return t("ownerWelcome.errors.expiredInvite");
  }

  return errorDescription || t("ownerWelcome.errors.confirmInvite");
}

export default function OwnerWelcomePage() {
  const router = useRouter();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [requestingFreshLink, setRequestingFreshLink] = useState(false);
  const [hasInviteSession, setHasInviteSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");
  const [expectedOwnerEmail, setExpectedOwnerEmail] = useState("");
  const [ownerAccount, setOwnerAccount] = useState<OwnerAccountRow | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerContext() {
      setLoading(true);
      setError("");
      setStatusMessage("");

      const expectedFromQuery =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("owner_email")?.trim().toLowerCase() || ""
          : "";
      const inviteLinkError = getSupabaseInviteError(t);
      const tokenHash =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("token_hash")?.trim() || ""
          : "";
      const tokenType =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("type")?.trim() || "magiclink"
          : "magiclink";

      setExpectedOwnerEmail(expectedFromQuery);

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: tokenType as any,
        });

        if (verifyError) {
          if (!cancelled) {
            setError(
              verifyError.message ||
                t("ownerWelcome.errors.loginLinkFailed")
            );
            setLoading(false);
          }
          return;
        }

        if (typeof window !== "undefined") {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("token_hash");
          cleanUrl.searchParams.delete("type");
          window.history.replaceState(null, "", cleanUrl.toString());
        }
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (!cancelled) {
          setError(sessionError.message);
          setLoading(false);
        }
        return;
      }

      const accessToken = session?.access_token;
      setHasInviteSession(!!accessToken);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cancelled) {
          setError(
            inviteLinkError ||
              t("ownerWelcome.errors.inviteSession")
          );
          setLoading(false);
        }
        return;
      }

      const authEmail = user.email?.trim().toLowerCase() || "";
      setSignedInEmail(authEmail);

      const resolvedOwnerEmail =
        expectedFromQuery ||
        (typeof user.user_metadata?.owner_email === "string"
          ? user.user_metadata.owner_email.trim().toLowerCase()
          : "") ||
        authEmail;

      if (!resolvedOwnerEmail) {
        if (!cancelled) {
          setError(t("ownerWelcome.errors.noOwnerEmail"));
          setLoading(false);
        }
        return;
      }

      const { data: owner, error: ownerError } = await supabase
        .from("owner_accounts")
        .select("*")
        .eq("email", resolvedOwnerEmail)
        .maybeSingle<OwnerAccountRow>();

      if (ownerError) {
        if (!cancelled) {
          setError(ownerError.message);
          setLoading(false);
        }
        return;
      }

      if (!owner) {
        if (!cancelled) {
          setOwnerAccount(null);
          setProperties([]);
          setError(t("ownerWelcome.errors.noOwnerAccount"));
          setLoading(false);
        }
        return;
      }

      const updates: Record<string, string | null> = {};

      if (!owner.profile_id) {
        updates.profile_id = user.id;
      }

      if (!owner.invite_accepted_at) {
        updates.invite_accepted_at = new Date().toISOString();
      }

      let finalOwner = owner;

      if (Object.keys(updates).length > 0) {
        const { data: updatedOwner, error: updateOwnerError } = await supabase
          .from("owner_accounts")
          .update(updates)
          .eq("id", owner.id)
          .select()
          .single<OwnerAccountRow>();

        if (updateOwnerError) {
          if (!cancelled) {
            setError(updateOwnerError.message);
            setLoading(false);
          }
          return;
        }

        finalOwner = updatedOwner;
      }

      const { data: accessRows, error: accessError } = (await supabase
        .from("owner_property_access")
        .select("*")
        .eq("owner_account_id", finalOwner.id)) as {
        data: OwnerPropertyAccessRow[] | null;
        error: { message: string } | null;
      };

      if (accessError) {
        if (!cancelled) {
          setError(accessError.message);
          setLoading(false);
        }
        return;
      }

      const propertyIds = (accessRows ?? []).map((row) => row.property_id);
      let linkedProperties: PropertyRow[] = [];

      if (propertyIds.length > 0) {
        const { data: propertyRows, error: propertyError } = await supabase
          .from("properties")
          .select("id,name,address")
          .in("id", propertyIds);

        if (propertyError) {
          if (!cancelled) {
            setError(propertyError.message);
            setLoading(false);
          }
          return;
        }

        linkedProperties = (propertyRows ?? []) as PropertyRow[];
      }

      if (!cancelled) {
        setOwnerAccount(finalOwner);
        setProperties(linkedProperties);
        setError("");

        if (authEmail && resolvedOwnerEmail && authEmail !== resolvedOwnerEmail) {
          setStatusMessage(
            t("ownerWelcome.errors.wrongEmail").replace("{expected}", resolvedOwnerEmail).replace("{actual}", authEmail)
          );
        } else if (accessToken) {
          setStatusMessage(t("ownerWelcome.errors.confirmed"));
        } else {
          setStatusMessage("");
        }

        setLoading(false);
      }
    }

    void loadOwnerContext();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const passwordReady = useMemo(() => {
    return password.trim().length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  const ownerMatched = !!ownerAccount;
  const wrongSignedInUser =
    !!expectedOwnerEmail && !!signedInEmail && expectedOwnerEmail !== signedInEmail;
  const canUseSetupActions = ownerMatched && hasInviteSession && !wrongSignedInUser;

  async function handleSetPassword() {
    if (!hasInviteSession) {
      setError(t("ownerWelcome.errors.inactiveInvite"));
      return;
    }

    if (wrongSignedInUser) {
      setError(t("ownerWelcome.errors.differentEmail"));
      return;
    }

    if (!ownerMatched) {
      setError(t("ownerWelcome.errors.correctEmail"));
      return;
    }

    if (!passwordReady) {
      setError(t("ownerWelcome.errors.passwordMismatch"));
      return;
    }

    if (!acceptedTerms) {
      setError(t("ownerWelcome.errors.acceptTerms"));
      return;
    }

    setSavingPassword(true);
    setError("");
    setStatusMessage("");

    const { error: updateError } = await supabase.auth.updateUser({
      password: password.trim(),
    });

    if (updateError) {
      setError(updateError.message);
      setSavingPassword(false);
      return;
    }

    await supabase.auth.signOut();

    const loginEmail = ownerAccount?.email || expectedOwnerEmail || signedInEmail || "";
    router.replace(
      `/owner/login?message=password_set${loginEmail ? `&email=${encodeURIComponent(loginEmail)}` : ""}`
    );
  }

  async function handleContinue() {
    if (!hasInviteSession) {
      setError(t("ownerWelcome.errors.freshBeforeContinue"));
      return;
    }

    if (!ownerMatched) {
      setError(t("ownerWelcome.errors.noMatch"));
      return;
    }

    if (!acceptedTerms) {
      setError(t("ownerWelcome.errors.acceptBeforeContinue"));
      return;
    }

    setContinuing(true);
    router.push("/owner");
  }

async function handleSignOut() {
  setSigningOut(true);
  await supabase.auth.signOut();
  setSigningOut(false);
  router.replace("/owner/login");
}

async function handleFreshLoginLink() {
  const loginEmail = expectedOwnerEmail || ownerAccount?.email || signedInEmail || "";
  const loginSig =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sig")?.trim() || ""
      : "";

  if (!loginEmail) {
    router.replace("/owner/login");
    return;
  }

  setRequestingFreshLink(true);
  setError("");
  setStatusMessage("");
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/owner/fresh-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? {
            Authorization: `Bearer ${session.access_token}`,
          }
        : {}),
    },
    body: JSON.stringify({
      email: loginEmail,
      sig: loginSig,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    setError(
      `${payload?.error || t("ownerWelcome.errors.freshLinkFailed")} ${t("ownerWelcome.errors.resendInvite")}`
    );
    setRequestingFreshLink(false);
    return;
  }

  const deliveryId = payload?.emailId ? t("ownerWelcome.errors.deliveryId").replace("{id}", payload.emailId) : "";
  setStatusMessage(t("ownerWelcome.errors.freshLinkSent").replace("{email}", loginEmail).replace("{delivery}", deliveryId));
  setRequestingFreshLink(false);
}

  if (loading) {
    return (
      <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
        <div className="owner-card mx-auto max-w-3xl rounded-[32px] border border-white/8 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          <div className="text-sm text-[#e6d8bf]">{t("ownerWelcome.loading")}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="owner-hero rounded-[32px] border border-white/8 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:px-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#e7c98a]">
            {t("ownerWelcome.eyebrow")}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
            {t("ownerWelcome.title").replace("{suffix}", ownerAccount?.full_name ? `, ${ownerAccount.full_name}` : "")}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#e6d8bf]">
            {t("ownerWelcome.intro")}
          </p>
        </section>

        {(error || wrongSignedInUser) ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            <div>{error || t("ownerWelcome.wrongAccount")}</div>
            {(signedInEmail || expectedOwnerEmail) ? (
              <div className="mt-2 space-y-1 text-xs text-red-100/90">
                {expectedOwnerEmail ? <div>{t("ownerWelcome.invitedEmail")} {expectedOwnerEmail}</div> : null}
                {signedInEmail ? <div>{t("ownerWelcome.signedInAs")} {signedInEmail}</div> : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleFreshLoginLink()}
                disabled={requestingFreshLink}
                className="rounded-full bg-[#b08b47] px-4 py-2 text-xs font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
              >
                {requestingFreshLink ? t("ownerWelcome.sendingLink") : t("ownerWelcome.freshLink")}
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                className="rounded-full border border-white/12 px-4 py-2 text-xs font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
              >
                {signingOut ? t("ownerWelcome.signingOut") : t("ownerWelcome.signOutTryAgain")}
              </button>
            </div>
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}

        <section className="owner-card rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">{t("ownerWelcome.accessTitle")}</div>
          <h2 className="mt-2 text-xl font-semibold text-[#f7f1e8]">{t("ownerWelcome.passwordTitle")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#e6d8bf]">
            {t("ownerWelcome.passwordIntro")}
          </p>
          {!hasInviteSession ? (
            <div className="mt-4 rounded-2xl border border-amber-400/25 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
              {t("ownerWelcome.activeSessionHelp")}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-[#b08b47]/35 bg-[#b08b47]/12 px-4 py-3 text-sm leading-6 text-[#ead8b8]">
            {t("ownerWelcome.testingNotice")}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">{t("ownerWelcome.newPassword")}</label>
              <div className="owner-field mt-2 flex rounded-2xl border border-white/8 focus-within:border-[#b08b47]">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm text-[#f7f1e8] outline-none"
                  placeholder={t("ownerWelcome.minimumPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#e6d8bf]"
                >
                  {showPassword ? t("ownerWelcome.hide") : t("ownerWelcome.show")}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">{t("ownerWelcome.confirmPassword")}</label>
              <div className="owner-field mt-2 flex rounded-2xl border border-white/8 focus-within:border-[#b08b47]">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm text-[#f7f1e8] outline-none"
                  placeholder={t("ownerWelcome.repeatPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="rounded-r-2xl px-4 text-sm font-medium text-[#e6d8bf]"
                >
                  {showConfirmPassword ? t("ownerWelcome.hide") : t("ownerWelcome.show")}
                </button>
              </div>
            </div>
          </div>

          <label className="mt-5 flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-[#e6d8bf]">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#b08b47]"
            />
            <span>
              {t("ownerWelcome.consentPrefix")}{" "}
              <Link href="/terms" className="font-semibold text-[#e7c98a] underline">
                {t("ownerWelcome.terms")}
              </Link>
              ,{" "}
              <Link href="/privacy" className="font-semibold text-[#e7c98a] underline">
                {t("ownerWelcome.privacyPolicy")}
              </Link>
              , {t("ownerLogin.and")}{" "}
              <Link href="/cookies" className="font-semibold text-[#e7c98a] underline">
                {t("ownerWelcome.cookieNotice")}
              </Link>
              .
            </span>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSetPassword()}
              disabled={savingPassword || !canUseSetupActions}
              className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
            >
              {savingPassword ? t("ownerWelcome.saving") : t("ownerWelcome.setPassword")}
            </button>

            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={continuing || !canUseSetupActions}
              className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
            >
              {continuing ? t("ownerWelcome.opening") : t("ownerWelcome.continueDashboard")}
            </button>

            <button
              type="button"
              onClick={() => {
                const loginEmail = expectedOwnerEmail || ownerAccount?.email || signedInEmail || "";
                router.push(`/owner/login${loginEmail ? `?email=${encodeURIComponent(loginEmail)}` : ""}`);
              }}
              className="rounded-full border border-[#b08b47]/50 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-[#b08b47]/10"
            >
              {t("ownerWelcome.alreadyHavePassword")}
            </button>
          </div>
        </section>

        <section className="owner-card rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">{t("ownerWelcome.confirmedAccount")}</div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-[#e6d8bf]">{t("ownerWelcome.signedInEmail")}</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {signedInEmail || t("ownerWelcome.unknown")}
              </div>
            </div>

            <div>
              <div className="text-sm text-[#e6d8bf]">{t("ownerWelcome.inviteEmail")}</div>
              <div className="mt-1 text-lg font-semibold text-[#f7f1e8]">
                {expectedOwnerEmail || ownerAccount?.email || t("ownerWelcome.unknown")}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#e7c98a]">{t("ownerWelcome.assignedProperties")}</div>
            <div className="mt-3 space-y-3">
              {properties.length > 0 ? (
                properties.map((property) => (
                  <div
                    key={property.id}
                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                  >
                    <div className="text-sm font-semibold text-[#f7f1e8]">
                      {property.name || t("ownerWelcome.property")}
                    </div>
                    <div className="mt-1 text-sm text-[#e6d8bf]">
                      {getCityFromAddress(property.address) || property.address || t("ownerWelcome.locationUnavailable")}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-[#e6d8bf]">
                  {t("ownerWelcome.noProperties")}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
