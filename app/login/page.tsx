"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
};

type AuthMode = "login" | "company";
const ORGANIZATION_TRIAL_DAYS = 30;

function slugifyCompanyName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

async function getPortalDestinationForUser(userId: string, role: string | null | undefined) {
  if (role === "platform_admin") {
    return "/platform";
  }

  if (role === "admin") {
    return "/admin";
  }

  const [
    { data: cleanerMemberships, error: cleanerError },
    { data: groundsMemberships, error: groundsError },
  ] = await Promise.all([
    supabase
      .from("cleaner_account_members")
      .select("id, profile_id")
      .eq("profile_id", userId)
      .limit(1),
    supabase
      .from("grounds_account_members")
      .select("id, profile_id")
      .eq("profile_id", userId)
      .limit(1),
  ]);


  const hasCleaner = !!cleanerMemberships?.length;
  const hasGrounds = !!groundsMemberships?.length;

  if (hasCleaner && hasGrounds) return "/choose-portal";
  if (hasCleaner) return "/cleaner";
  if (hasGrounds) return "/grounds";
  return "/login";
}

export default function LoginPage() {
  const router = useRouter();
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
  const [signupAcceptedTerms, setSignupAcceptedTerms] = useState(false);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingResend, setLoadingResend] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  async function handleLogin(e?: FormEvent) {
    e?.preventDefault();

    setError("");
    setMessage("");
    setLoadingLogin(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Login succeeded, but no user session was found.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,email,full_name,phone,role")
        .eq("id", user.id)
        .single<ProfileRow>();

      if (profileError || !profile) {
        setError("Could not load your profile.");
        return;
      }

      const destination = await getPortalDestinationForUser(user.id, profile.role);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Login succeeded, but no session was ready yet. Please try again.");
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
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/reset`,
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

    setError("");
    setMessage("");

    if (!signupName.trim()) {
      setError("Please enter your full name.");
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

    if (!signupPassword) {
      setError("Please enter a password.");
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
      let createdOrganizationId: string | null = null;
      let promotedToAdmin = false;
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/login`,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      const userId = data.user?.id;

      if (userId) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: signupName.trim(),
            phone: signupPhone.trim(),
            role: "admin",
          })
          .eq("id", userId);

        if (profileError) {
          setError(profileError.message);
          return;
        }

        promotedToAdmin = true;

        const baseSlug = slugifyCompanyName(companyName);
        const uniqueSlug = `${baseSlug || "company"}-${Date.now().toString().slice(-6)}`;

        const trialStartedAt = new Date();
        const trialEndsAt = new Date(trialStartedAt);
        trialEndsAt.setDate(trialEndsAt.getDate() + ORGANIZATION_TRIAL_DAYS);

        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: companyName.trim(),
            slug: uniqueSlug,
            created_by: userId,
            subscription_status: "trialing",
            trial_started_at: trialStartedAt.toISOString(),
            trial_ends_at: trialEndsAt.toISOString(),
            billing_enabled: false,
          })
          .select("id")
          .single();

        if (orgError || !org) {
          const message = orgError?.message || "Failed to create organization.";
          if (message.includes("subscription_status") || message.includes("trial_ends_at")) {
            setError(
              "The organization trial fields are not in Supabase yet. Run supabase/add_organization_trial_fields.sql, then try creating the company again."
            );
          } else if (message.includes("row-level security") && message.includes("organizations")) {
            setError(
              "Company signup is blocked by the organization security policy. Run supabase/fix_company_signup_rls.sql in Supabase, then try creating the company again."
            );
          } else {
            setError(message);
          }

          if (promotedToAdmin) {
            await supabase
              .from("profiles")
              .update({ role: "pending" })
              .eq("id", userId);
          }

          return;
        }

        createdOrganizationId = org.id;

        const { error: memberError } = await supabase.from("organization_members").insert({
          organization_id: org.id,
          profile_id: userId,
          role: "admin",
        });

        if (memberError) {
          if (createdOrganizationId) {
            await supabase
              .from("organizations")
              .delete()
              .eq("id", createdOrganizationId);
          }

          if (promotedToAdmin) {
            await supabase
              .from("profiles")
              .update({ role: "pending" })
              .eq("id", userId);
          }

          setError(memberError.message);
          return;
        }
      }

      setMessage(
        `Company account created with a ${ORGANIZATION_TRIAL_DAYS}-day free trial. Check your email to confirm your account.`
      );

      setSignupName("");
      setSignupPhone("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
      setCompanyName("");
    } finally {
      setLoadingSignup(false);
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
      <div className="mx-auto flex min-h-screen max-w-6xl items-start p-4 pt-6 md:items-center md:p-6 md:pt-0">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)] lg:grid-cols-[0.95fr_1.05fr]">
          <section className="bg-[linear-gradient(135deg,#1f1812_0%,#2a2119_55%,#3a2c1d_100%)] px-6 py-8 text-white md:px-10 md:py-12">
            <div className="max-w-md">
              <div className="mb-6 rounded-[22px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(0,0,0,0.18)]">
                <Image
                  src="/guleraoslogo.png"
                  alt="Gulera OS"
                  width={420}
                  height={180}
                  className="mx-auto h-auto w-full max-w-[300px]"
                  priority
                />
              </div>

              <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                {t("login.eyebrow")}
              </div>

              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {t("login.title")}
              </h1>

              <p className="mt-4 text-sm leading-7 text-[#e7dccb] md:text-base">
                {t("login.intro")}
              </p>

              <div className="mt-8 grid gap-3">
                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">{t("login.adminTitle")}</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    {t("login.adminBody")}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">{t("login.teamTitle")}</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    {t("login.teamBody")}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">{t("login.returningTitle")}</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    {t("login.returningBody")}
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#d8c7ab]/35 bg-[#f2e6d1]/10 px-4 py-4">
                  <div className="text-sm font-semibold text-white">{t("login.ownerTitle")}</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    {t("login.ownerBody")}
                  </div>
                  <Link
                    href="/owner/login"
                    className="mt-3 inline-flex items-center rounded-full border border-[#d8c7ab] px-4 py-2 text-sm font-medium text-[#f7e5bf] transition hover:bg-white/10"
                  >
                    {t("login.ownerLink")}
                  </Link>
                </div>
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                        >
                          👁
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
                  </section>
                ) : null}

                {authMode === "company" ? (
                  <section className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">{t("login.createCompanyHeading")}</h2>
                    <p className="mt-1 text-sm text-[#7f7263]">
                      {t("login.createCompanySubheading")}
                    </p>
                    <div className="mt-4 rounded-[20px] border border-[#efd8a8] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-[#6f5525]">
                      {t("login.testingNotice")}
                    </div>

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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                          onClick={() => setShowSignupPassword(!showSignupPassword)}
                        >
                          {showSignupPassword ? t("login.hide") : t("login.show")}
                        </button>
                      </div>

                      <div className="relative">
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                          onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                        >
                          {showSignupConfirmPassword ? t("login.hide") : t("login.show")}
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
                          disabled={loadingSignup}
                        >
                          {loadingSignup ? t("login.creatingCompany") : t("login.createCompanyButton")}
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
