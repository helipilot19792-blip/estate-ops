"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  ReceiptText,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy";
import { trackPublicFunnelEvent } from "@/lib/public-funnel";
import { supabase } from "@/lib/supabase";
import { useI18n } from "@/components/i18n-provider";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
};

type SignupAvailability = {
  signupOpen: boolean;
  signupEnabled: boolean;
  signupLimit: number | null;
  signupCount: number;
  signupRemaining: number | null;
};

type AuthMode = "login" | "company";
const ORGANIZATION_TRIAL_DAYS = 30;
const PENDING_INVITE_TOKEN_KEY = "gulera_pending_invite_token";

function getFriendlyLoginError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email or password was not accepted. Check the email spelling, then use Forgot password to set a fresh password. If you were invited recently, open the newest invite email first.";
  }

  if (normalized.includes("email not confirmed")) {
    return "This email still needs confirmation. Use Resend confirmation, then open the newest email from this browser.";
  }

  return message;
}

function scrollInputIntoView(target: EventTarget | null) {
  if (typeof window === "undefined") return;
  const element = target as HTMLElement | null;
  if (!element) return;

  window.setTimeout(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, 250);
}

function scrollFeedbackIntoView() {
  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, 100);
}

async function getPortalDestinationFromServer(accessToken: string) {
  const response = await fetch("/api/portal-destination", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Could not check which portal this account can use.");
  }

  return result.destination as string;
}

async function acceptPendingInviteFromLogin(accessToken: string) {
  if (typeof window === "undefined") return null;

  const token = window.localStorage.getItem(PENDING_INVITE_TOKEN_KEY)?.trim();
  if (!token) return null;

  console.info("[login] attempting pending invite acceptance", {
    tokenSuffix: token.slice(-8),
  });

  const response = await fetch("/api/invite/accept", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.warn("[login] pending invite acceptance failed", {
      status: response.status,
      error: result?.error,
    });

    if ([400, 403, 404].includes(response.status)) {
      window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
    }

    throw new Error(result?.error || "Could not connect your invite.");
  }

  window.localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);
  console.info("[login] pending invite accepted");
  return result;
}

async function finishCompanySignup(accessToken: string, details?: {
  fullName?: string;
  phone?: string;
  companyName?: string;
  organizationType?: "property_management" | "cleaning_company";
}) {
  const response = await fetch("/api/company-signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fullName: details?.fullName || "",
      phone: details?.phone || "",
      companyName: details?.companyName || "",
      organizationType: details?.organizationType || "",
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || "Failed to create your workspace.");
  }

  return result;
}

export default function LoginPage() {
  const { t } = useI18n();

  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [organizationType, setOrganizationType] = useState<"property_management" | "cleaning_company">("property_management");
  const [signupAcceptedTerms, setSignupAcceptedTerms] = useState(false);
  const [pendingSignupUserId, setPendingSignupUserId] = useState("");
  const [signupAvailability, setSignupAvailability] = useState<SignupAvailability | null>(null);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingResend, setLoadingResend] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [loadingCancelSignup, setLoadingCancelSignup] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryType = url.searchParams.get("type");
    const hashType = hashParams.get("type");
    const hasRecoveryHash =
      hashType === "recovery" &&
      Boolean(hashParams.get("access_token") && hashParams.get("refresh_token"));
    const hasRecoveryQuery =
      queryType === "recovery" &&
      Boolean(url.searchParams.get("code") || url.searchParams.get("token_hash"));

    if (url.searchParams.get("mode") === "company") {
      setAuthMode("company");
    }

    if (hasRecoveryHash) {
      window.location.replace(`/auth/reset${window.location.hash}`);
      return;
    }

    if (hasRecoveryQuery) {
      window.location.replace(`/auth/reset${url.search}`);
    }
  }, []);

  useEffect(() => {
    if (authMode === "company") {
      trackPublicFunnelEvent("signup_view");
    }
  }, [authMode]);

  useEffect(() => {
    let active = true;

    async function loadSignupAvailability() {
      try {
        const response = await fetch("/api/company-signup");
        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.ok || !active) return;

        setSignupAvailability({
          signupOpen: Boolean(result.signupOpen),
          signupEnabled: Boolean(result.signupEnabled),
          signupLimit: typeof result.signupLimit === "number" ? result.signupLimit : null,
          signupCount: Number(result.signupCount || 0),
          signupRemaining: typeof result.signupRemaining === "number" ? Number(result.signupRemaining) : null,
        });
      } catch {
        // Leave availability empty if the public status check is unavailable.
      }
    }

    void loadSignupAvailability();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(e?: FormEvent) {
    e?.preventDefault();

    setError("");
    setMessage("");
    setLoadingLogin(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (error) {
        setError(getFriendlyLoginError(error.message));
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Login succeeded, but no user session was found.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Login succeeded, but no session was ready yet. Please try again.");
        return;
      }

      const metadata = user.user_metadata || {};

      let pendingInviteError = "";
      try {
        await acceptPendingInviteFromLogin(session.access_token);
      } catch (inviteError) {
        pendingInviteError =
          inviteError instanceof Error ? inviteError.message : "Could not connect your invite.";
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone,role")
        .eq("id", user.id)
        .maybeSingle<ProfileRow>();

      if (profileError || !profile) {
        setError(pendingInviteError || "Could not load your profile.");
        return;
      }

      if (profile.role === "pending" && metadata.signup_kind === "company_admin") {
        try {
          await finishCompanySignup(session.access_token);
          trackPublicFunnelEvent("trial_created");
          window.location.href = "/admin";
          return;
        } catch (signupError) {
          const message = signupError instanceof Error ? signupError.message : "Could not finish account setup.";
          setError(message);
          return;
        }
      }

      let destination = "/login";
      try {
        destination = await getPortalDestinationFromServer(session.access_token);
      } catch (destinationError) {
        const message =
          destinationError instanceof Error
            ? destinationError.message
            : "Could not check which portal this account can use.";
        setError(message);
        return;
      }

      if (destination === "/login") {
        setError(
          pendingInviteError ||
            "This sign-in is not linked to a company, cleaner, grounds, or owner account yet. If you were invited, use the newest invite email. If you were creating a new account, start signup again."
        );
        return;
      }


      window.location.href = destination;
      return;
    } finally {
      setLoadingLogin(false);
    }
  }

  async function handleResetPassword() {
    setError("");
    setMessage("");

    if (!loginEmail.trim()) {
      setError("Enter your email above first.");
      scrollFeedbackIntoView();
      return;
    }

    setLoadingReset(true);

    try {
      const normalizedEmail = loginEmail.trim().toLowerCase();

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });

      if (error) {
        setError(error.message);
        scrollFeedbackIntoView();
        return;
      }

      setMessage(`Password reset email sent to ${normalizedEmail}. Check your inbox and spam folder.`);
      scrollFeedbackIntoView();
    } finally {
      setLoadingReset(false);
    }
  }

  async function handleCompanySignup(e?: FormEvent) {
    e?.preventDefault();

    trackPublicFunnelEvent("signup_attempt");

    setError("");
    setMessage("");

    if (signupAvailability?.signupOpen === false) {
      setError(
        signupAvailability.signupEnabled
          ? "Beta signup is currently full. Please contact support to join the waitlist."
          : "New user signup is paused right now. Please contact support to join the beta."
      );
      return;
    }

    if (!signupName.trim()) {
      setError("Please enter your name.");
      return;
    }

    if (!signupPhone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!signupEmail.trim()) {
      setError("Please enter your work email.");
      return;
    }

    if (!companyName.trim()) {
      setError("Please enter your company name.");
      return;
    }

    const passwordError = validatePassword(signupPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!signupAcceptedTerms) {
      setError("Please accept the testing terms and privacy policy before creating an account.");
      return;
    }

    setLoadingSignup(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/login`,
          data: {
            full_name: signupName.trim(),
            phone: signupPhone.trim(),
            company_name: companyName.trim(),
            organization_type: organizationType,
            signup_kind: "company_admin",
          },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      trackPublicFunnelEvent("signup_account_created");

      const userId = data.user?.id;
      setPendingSignupUserId(userId || "");
      const accessToken =
        data.session?.access_token ||
        (await supabase.auth.getSession()).data.session?.access_token;

      if (!userId) {
        setError("Account created, but no user id was returned. Confirm your email, then log in.");
        return;
      }

      if (!accessToken) {
        setMessage("Account created. Check your email to confirm it, then log in here to finish creating your workspace.");
        setSignupPassword("");
        setSignupConfirmPassword("");
        return;
      }

      try {
        await finishCompanySignup(accessToken, {
          fullName: signupName.trim(),
          phone: signupPhone.trim(),
          companyName: companyName.trim(),
          organizationType,
        });
        trackPublicFunnelEvent("trial_created");
      } catch (signupError) {
        const message = signupError instanceof Error ? signupError.message : "Failed to create your workspace.";
        setError(message);
        return;
      }

      setMessage(
        `Account created with a ${ORGANIZATION_TRIAL_DAYS}-day free trial. Check your email to confirm your account.`
      );

      setSignupName("");
      setSignupPhone("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setCompanyName("");
      setOrganizationType("property_management");
      setPendingSignupUserId("");
    } finally {
      setLoadingSignup(false);
    }
  }

  async function handleWrongSignupEmail() {
    setError("");
    setMessage("");

    const email = signupEmail.trim().toLowerCase();

    if (!email) {
      setMessage("Enter the correct email and continue creating your account.");
      return;
    }

    if (!pendingSignupUserId) {
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setMessage(
        "The email field has been cleared. If a confirmation email was already sent to the wrong address, contact support so the pending account can be removed."
      );
      return;
    }

    setLoadingCancelSignup(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/company-signup/cancel", {
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
          userId: pendingSignupUserId,
          email,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          result?.error ||
            "Could not clear the pending signup. If the browser no longer has the original signup session, contact support."
        );
        return;
      }

      await supabase.auth.signOut();
      setPendingSignupUserId("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setMessage("Pending signup cleared. Enter the correct email and create your account again.");
    } finally {
      setLoadingCancelSignup(false);
    }
  }

  async function handleResendConfirmation() {
    setError("");
    setMessage("");

    if (!loginEmail.trim()) {
      setError("Enter your email in the login section first.");
      return;
    }

    setLoadingResend(true);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: loginEmail.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/login`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Confirmation email sent.");
    } finally {
      setLoadingResend(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] pb-32 text-[#241c15] md:pb-0">
      <div className="mx-auto flex min-h-screen max-w-7xl items-start p-4 pt-6 md:items-center md:p-6 md:pt-0">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)] lg:grid-cols-[1.08fr_0.92fr]">
          <section className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_5%,rgba(206,166,98,0.24),transparent_30%),linear-gradient(145deg,#17110d_0%,#261c15_55%,#3b2b1d_100%)] px-6 py-8 text-white md:px-10 md:py-10">
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full border border-white/10" />
            <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full border border-[#d7b779]/20" />
            <div className="relative max-w-md">
              <div className="mb-8 inline-flex rounded-[18px] bg-white px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.2)]">
                <Image
                  src="/guleraoslogo.png"
                  alt="Gulera OS"
                  width={420}
                  height={180}
                  className="h-auto w-[190px]"
                  priority
                />
              </div>

              <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                {t("login.eyebrow")}
              </div>

              <h1 className="max-w-lg text-4xl font-semibold leading-[1.08] tracking-[-0.035em] md:text-5xl">
                Run every property from one calm workspace.
              </h1>

              <p className="mt-5 max-w-lg text-base leading-7 text-[#e7dccb]">
                Bookings, turnovers, staff, maintenance, owner updates, invoices, and property knowledge—organized for operators managing a growing portfolio.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/demo"
                  className="inline-flex items-center gap-2 rounded-full bg-[#f4d99f] px-5 py-3 text-sm font-semibold text-[#2b2017] shadow-[0_12px_30px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffe8b9]"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  Explore the 4-property demo
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => setAuthMode("company")}
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/7 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
                >
                  Start a 30-day trial
                </button>
              </div>

              <div className="mt-9 rounded-[26px] border border-white/12 bg-white/[0.07] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] backdrop-blur-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d8c7ab]">Today across 4 properties</div>
                    <div className="mt-1 text-lg font-semibold">Your portfolio at a glance</div>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-300" /> Live
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  {[
                    ["4", "Properties"],
                    ["3", "Turns this week"],
                    ["1", "Needs attention"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-[18px] border border-white/10 bg-black/10 px-3 py-3">
                      <div className="text-2xl font-semibold text-[#f9e8c4]">{value}</div>
                      <div className="mt-1 text-[11px] leading-4 text-[#d8c7ab]">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-3 rounded-[18px] border border-white/10 bg-[#f8f1e5] px-4 py-3 text-[#2b2118]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#ead8b6] text-[#704e1b]">
                      <CalendarDays size={19} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">Lake House turnover</div>
                      <div className="mt-0.5 text-xs text-[#756656]">Tomorrow · Maria assigned · checklist ready</div>
                    </div>
                    <CheckCircle2 size={18} className="text-emerald-600" aria-hidden="true" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-[#d8c7ab]"><Wrench size={15} /> Maintenance</div>
                      <div className="mt-2 text-sm font-semibold">1 open issue</div>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-black/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-[#d8c7ab]"><ReceiptText size={15} /> Owner billing</div>
                      <div className="mt-2 text-sm font-semibold">2 invoices ready</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#d8c7ab]">
                <span className="inline-flex items-center gap-2"><Building2 size={15} /> From $20 CAD/month</span>
                <span className="hidden h-1 w-1 rounded-full bg-[#8c7963] sm:block" />
                <span>Up to 10 properties</span>
                <span className="hidden h-1 w-1 rounded-full bg-[#8c7963] sm:block" />
                <span>30-day free trial</span>
              </div>
            </div>
          </section>

          <section className="bg-white px-5 py-6 md:px-10 md:py-12">
            <div className="mx-auto max-w-xl">
              {error ? (
                <div className="mb-4 rounded-[20px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="mb-4 rounded-[20px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245] shadow-sm">
                  {message}
                </div>
              ) : null}

              <div className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-3 shadow-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`rounded-[18px] px-4 py-3 text-sm font-medium transition ${authMode === "login"
                      ? "bg-[#241c15] text-[#f8f2e8]"
                      : "bg-white text-[#5f5245] hover:bg-[#fffaf4]"
                      }`}
                  >
                    {t("login.loginTab")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMode("company")}
                    className={`rounded-[18px] px-4 py-3 text-sm font-medium transition ${authMode === "company"
                      ? "bg-[#b48d4e] text-white"
                      : "bg-white text-[#7a5a23] hover:bg-[#fffaf4]"
                      }`}
                  >
                    {t("login.companyTab")}
                  </button>
                </div>
              </div>

              <div className="mt-6">
                {authMode === "login" ? (
                  <section className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-5 shadow-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">{t("login.loginHeading")}</h2>
                    <p className="mt-1 text-sm text-[#7f7263]">{t("login.loginSubheading")}</p>

                    <div className="mt-4 rounded-[20px] border border-[#d8c7ab] bg-white px-4 py-3 text-sm text-[#5f5245]">
                      <div className="font-medium text-[#241c15]">{t("login.ownerHelpTitle")}</div>
                      <div className="mt-1">
                        {t("login.ownerHelpBody")}{" "}
                        <Link href="/owner/login" className="font-medium text-[#7a5a23] underline underline-offset-2">
                          {t("login.ownerLink")}
                        </Link>
                      </div>
                    </div>

                    <form onSubmit={handleLogin} className="mt-5 space-y-3">
                      <input
                        className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        type="email"
                        placeholder={t("login.email")}
                        autoComplete="email"
                        inputMode="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <div className="relative">
                        <input
                          className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                          type={showLoginPassword ? "text" : "password"}
                          placeholder={t("login.password")}
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#e4d7c7] bg-white text-[#7a5a23] transition hover:border-[#c6a767] hover:text-[#241c15]"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          aria-label={showLoginPassword ? t("login.hide") : t("login.show")}
                          title={showLoginPassword ? t("login.hide") : t("login.show")}
                        >
                          {showLoginPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={loadingLogin}
                        >
                          {loadingLogin ? t("login.loggingIn") : t("login.loginTab")}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-4 pt-1 text-sm">
                        <button
                          type="button"
                          className="text-[#241c15] underline underline-offset-2 hover:text-[#5f5245] disabled:opacity-60"
                          onClick={handleResetPassword}
                          disabled={loadingReset}
                        >
                          {loadingReset ? t("login.sending") : t("login.forgotPassword")}
                        </button>

                        <button
                          type="button"
                          className="text-[#241c15] underline underline-offset-2 hover:text-[#5f5245] disabled:opacity-60"
                          onClick={handleResendConfirmation}
                          disabled={loadingResend}
                        >
                          {loadingResend ? t("login.sending") : t("login.resendConfirmation")}
                        </button>
                      </div>
                    </form>

                    <div className="mt-6 overflow-hidden rounded-[22px] border border-[#d8c7ab] bg-[linear-gradient(135deg,#fffaf1_0%,#f6ead4_100%)] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#241c15] text-[#f4d99f]">
                          <Sparkles size={19} aria-hidden="true" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#241c15]">See how it works before signing up</div>
                          <p className="mt-1 text-sm leading-6 text-[#6f6255]">
                            Tour a realistic four-property portfolio with bookings, turnovers, maintenance, team coverage, and owner billing.
                          </p>
                          <Link
                            href="/demo"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#744f18] underline decoration-[#c7a66e] underline-offset-4"
                          >
                            Open the guided demo <ArrowRight size={15} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : null}

                {authMode === "company" ? (
                  <section className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">{t("login.createCompanyHeading")}</h2>
                    <p className="mt-1 text-sm text-[#7f7263]">
                      {t("login.createCompanySubheading")}
                    </p>
                    <div className="mt-4 rounded-[20px] border border-[#ead8b5] bg-[#fff9ef] px-4 py-4 text-sm leading-6 text-[#5f5245]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-[#efd29c] bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a6a35]">
                          Starter
                        </span>
                        <span className="text-base font-semibold text-[#241c15]">$20 CAD/month</span>
                        <span className="text-[#8a7b68]">for up to 10 properties</span>
                      </div>
                      <div className="mt-2">
                        Includes a {ORGANIZATION_TRIAL_DAYS}-day free trial. Growth is $40 CAD/month for up to 25 properties, with custom pricing for larger portfolios.
                      </div>
                    </div>
                    {signupAvailability ? (
                      <div
                        className={`mt-4 rounded-[20px] border px-4 py-3 text-sm leading-6 ${
                          signupAvailability.signupOpen
                            ? "border-[#d8c7ab] bg-[#fcfaf7] text-[#5f5245]"
                            : "border-[#efc6c6] bg-[#fff5f5] text-[#8a2e22]"
                        }`}
                      >
                        {signupAvailability.signupOpen
                          ? signupAvailability.signupLimit === null
                            ? "Beta signup is open."
                            : typeof signupAvailability.signupRemaining === "number"
                              ? signupAvailability.signupRemaining === 1
                                ? "1 testing slot available."
                                : `${signupAvailability.signupRemaining} testing slots available.`
                              : "Beta signup is open."
                          : signupAvailability.signupEnabled
                            ? "No testing slots available right now."
                            : "Beta signup is currently paused."}
                      </div>
                    ) : null}
                    <div className="mt-4 rounded-[20px] border border-[#efd8a8] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#6f5525]">
                      {t("login.testingNotice")}
                    </div>
                    {error ? (
                      <div className="mt-4 rounded-[20px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22] shadow-sm">
                        {error}
                      </div>
                    ) : null}

                    <form onSubmit={handleCompanySignup} className="mt-5 grid gap-3 md:grid-cols-2">
                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder={t("login.fullName")}
                        autoComplete="name"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder={t("login.phoneNumber")}
                        autoComplete="tel"
                        inputMode="tel"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="email"
                        placeholder={t("login.workEmail")}
                        autoComplete="email"
                        inputMode="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder={t("login.companyName")}
                        autoComplete="organization"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <div className="md:col-span-2 grid gap-2 rounded-[20px] border border-[#e7ddd0] bg-[#fcfaf7] p-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setOrganizationType("property_management")}
                          className={`rounded-[16px] border px-4 py-3 text-left text-sm transition ${
                            organizationType === "property_management"
                              ? "border-[#b48d4e] bg-white text-[#241c15] shadow-sm"
                              : "border-transparent text-[#6f6255] hover:bg-white"
                          }`}
                        >
                          <div className="font-semibold">Property management</div>
                          <div className="mt-1 text-xs leading-5 text-[#7f7263]">
                            Full PM/co-host dashboard with owners, invoices, properties, jobs, and documents.
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrganizationType("cleaning_company")}
                          className={`rounded-[16px] border px-4 py-3 text-left text-sm transition ${
                            organizationType === "cleaning_company"
                              ? "border-[#2f855a] bg-white text-[#17382d] shadow-sm"
                              : "border-transparent text-[#6f6255] hover:bg-white"
                          }`}
                        >
                          <div className="font-semibold">Cleaning company</div>
                          <div className="mt-1 text-xs leading-5 text-[#5e7469]">
                            Focused admin for cleaners, jobs, schedules, access, SOPs, issues, and completion.
                          </div>
                        </button>
                      </div>

                      <div className="md:col-span-2">
                        <div className="relative">
                          <input
                            className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                            type={showSignupPassword ? "text" : "password"}
                            placeholder={t("login.password")}
                            autoComplete="new-password"
                            value={signupPassword}
                            onChange={(e) => setSignupPassword(e.target.value)}
                            onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#e4d7c7] bg-white text-[#7a5a23] transition hover:border-[#c6a767] hover:text-[#241c15]"
                            onClick={() => setShowSignupPassword(!showSignupPassword)}
                            aria-label={showSignupPassword ? t("login.hide") : t("login.show")}
                            title={showSignupPassword ? t("login.hide") : t("login.show")}
                          >
                            {showSignupPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                          </button>
                        </div>
                        <p className="mt-1 px-1 text-xs text-[#7f7263]">{PASSWORD_REQUIREMENTS}</p>
                      </div>

                      <div className="relative md:col-span-2">
                        <input
                          className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                          type={showSignupConfirmPassword ? "text" : "password"}
                          placeholder={t("login.confirmPassword")}
                          autoComplete="new-password"
                          value={signupConfirmPassword}
                          onChange={(e) => setSignupConfirmPassword(e.target.value)}
                          onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#e4d7c7] bg-white text-[#7a5a23] transition hover:border-[#c6a767] hover:text-[#241c15]"
                          onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                          aria-label={showSignupConfirmPassword ? t("login.hide") : t("login.show")}
                          title={showSignupConfirmPassword ? t("login.hide") : t("login.show")}
                        >
                          {showSignupConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                        </button>
                      </div>

                      <label className="md:col-span-2 flex gap-3 rounded-[20px] border border-[#e7ddd0] bg-[#fcfaf7] px-4 py-3 text-sm leading-6 text-[#5f5245]">
                        <input
                          type="checkbox"
                          checked={signupAcceptedTerms}
                          onChange={(e) => setSignupAcceptedTerms(e.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#b48d4e]"
                        />
                        <span>
                          {t("login.testingAgreementPrefix")}{" "}
                          <Link href="/terms" className="font-semibold text-[#7d581b] underline">
                            {t("common.terms")}
                          </Link>
                          ,{" "}
                          <Link href="/privacy" className="font-semibold text-[#7d581b] underline">
                            {t("login.privacyPolicy")}
                          </Link>
                          , and{" "}
                          <Link href="/cookies" className="font-semibold text-[#7d581b] underline">
                            {t("login.cookieNotice")}
                          </Link>
                          .
                        </span>
                      </label>

                      <div className="md:col-span-2 mt-1">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-full bg-[#b48d4e] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(180,141,78,0.25)] transition hover:bg-[#a27d43] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={loadingSignup || signupAvailability?.signupOpen === false}
                        >
                          {loadingSignup ? t("login.creatingCompany") : t("login.createCompanyButton")}
                        </button>
                      </div>

                      <div className="md:col-span-2 rounded-[20px] border border-[#e7ddd0] bg-[#fcfaf7] px-4 py-3 text-sm leading-6 text-[#5f5245]">
                        <div className="font-medium text-[#241c15]">{t("login.wrongEmailTitle")}</div>
                        <div className="mt-1">{t("login.wrongEmailBody")}</div>
                        <button
                          type="button"
                          className="mt-3 inline-flex items-center justify-center rounded-full border border-[#d8c7ab] px-4 py-2 text-sm font-medium text-[#7a5a23] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={handleWrongSignupEmail}
                          disabled={loadingSignup || loadingCancelSignup}
                        >
                          {loadingCancelSignup ? t("login.clearingSignup") : t("login.wrongEmailButton")}
                        </button>
                      </div>
                    </form>

                    <p className="mt-4 text-xs leading-6 text-[#8a7b68]">
                      {t("login.legalFooter")}{" "}
                      <Link href="/terms" className="font-semibold underline">
                        {t("common.terms")}
                      </Link>
                      ,{" "}
                      <Link href="/privacy" className="font-semibold underline">
                        {t("common.privacy")}
                      </Link>
                      ,{" "}
                      <Link href="/cookies" className="font-semibold underline">
                        {t("common.cookies")}
                      </Link>
                      .
                    </p>
                  </section>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
