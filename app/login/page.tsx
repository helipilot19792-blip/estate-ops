"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
};

type AuthMode = "login" | "company";

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

async function getPortalDestinationForUser(userId: string, role: string | null | undefined) {
  if (role === "admin") {
    return "/admin";
  }

  const [{ data: cleanerMemberships }, { data: groundsMemberships }] = await Promise.all([
    supabase
      .from("cleaner_account_members")
      .select("id")
      .eq("profile_id", userId)
      .limit(1),
    supabase
      .from("grounds_account_members")
      .select("id")
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

  const [authMode, setAuthMode] = useState<AuthMode>("login");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");

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

      alert(`DEBUG login destination: ${destination}`);
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
      return;
    }

    setLoadingReset(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/reset`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Password reset email sent.");
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

    setLoadingSignup(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail.trim(),
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

        const baseSlug = slugifyCompanyName(companyName);
        const uniqueSlug = `${baseSlug || "company"}-${Date.now().toString().slice(-6)}`;

        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: companyName.trim(),
            slug: uniqueSlug,
            created_by: userId,
          })
          .select("id")
          .single();

        if (orgError || !org) {
          setError(orgError?.message || "Failed to create organization.");
          return;
        }

        const { error: memberError } = await supabase.from("organization_members").insert({
          organization_id: org.id,
          profile_id: userId,
          role: "admin",
        });

        if (memberError) {
          setError(memberError.message);
          return;
        }
      }

      setMessage("Company account created. Check your email to confirm your account.");

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
                Gulera OS
              </div>

              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Company Admin Access
              </h1>

              <p className="mt-4 text-sm leading-7 text-[#e7dccb] md:text-base">
                Sign in to your existing workspace or create a new company account. Staff and
                owner access is managed by invitation from inside each company workspace.
              </p>

              <div className="mt-8 grid gap-3">
                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">For company admins</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    Launch your own isolated Gulera OS workspace.
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">For invited team members</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    Cleaner, grounds, and owner access should come from an admin invite.
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                  <div className="text-sm font-semibold text-white">For returning users</div>
                  <div className="mt-1 text-sm text-[#e7dccb]">
                    Use the login tab to access your existing portal.
                  </div>
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
                    Login
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMode("company")}
                    className={`rounded-[18px] px-4 py-3 text-sm font-medium transition ${authMode === "company"
                      ? "bg-[#b48d4e] text-white"
                      : "bg-white text-[#7a5a23] hover:bg-[#fffaf4]"
                      }`}
                  >
                    Create Company
                  </button>
                </div>
              </div>

              <div className="mt-6">
                {authMode === "login" ? (
                  <section className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-5 shadow-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">Login</h2>
                    <p className="mt-1 text-sm text-[#7f7263]">Existing staff or admin account</p>

                    <form onSubmit={handleLogin} className="mt-5 space-y-3">
                      <input
                        className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        type="email"
                        placeholder="Email"
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
                          placeholder="Password"
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
                          {loadingLogin ? "Logging in..." : "Login"}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-4 pt-1 text-sm">
                        <button
                          type="button"
                          className="text-[#241c15] underline underline-offset-2 hover:text-[#5f5245] disabled:opacity-60"
                          onClick={handleResetPassword}
                          disabled={loadingReset}
                        >
                          {loadingReset ? "Sending..." : "Forgot password?"}
                        </button>

                        <button
                          type="button"
                          className="text-[#241c15] underline underline-offset-2 hover:text-[#5f5245] disabled:opacity-60"
                          onClick={handleResendConfirmation}
                          disabled={loadingResend}
                        >
                          {loadingResend ? "Sending..." : "Resend confirmation"}
                        </button>
                      </div>
                    </form>
                  </section>
                ) : null}

                {authMode === "company" ? (
                  <section className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-sm">
                    <h2 className="text-2xl font-semibold tracking-tight">Create Company Account</h2>
                    <p className="mt-1 text-sm text-[#7f7263]">
                      Start your own Gulera OS workspace as the first admin for your company
                    </p>

                    <form onSubmit={handleCompanySignup} className="mt-5 grid gap-3 md:grid-cols-2">
                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder="Full name"
                        autoComplete="name"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder="Phone number"
                        autoComplete="tel"
                        inputMode="tel"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="email"
                        placeholder="Work email"
                        autoComplete="email"
                        inputMode="email"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <input
                        className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type="text"
                        placeholder="Company name"
                        autoComplete="organization"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                      />

                      <div className="relative">
                        <input
                          className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                          type={showSignupPassword ? "text" : "password"}
                          placeholder="Password"
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
                          👁
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                          type={showSignupConfirmPassword ? "text" : "password"}
                          placeholder="Confirm password"
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
                          👁
                        </button>
                      </div>

                      <div className="md:col-span-2 mt-1">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-full bg-[#b48d4e] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(180,141,78,0.25)] transition hover:bg-[#a27d43] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={loadingSignup}
                        >
                          {loadingSignup ? "Creating company..." : "Create Company Account"}
                        </button>
                      </div>
                    </form>

                    <p className="mt-4 text-xs leading-6 text-[#8a7b68]">
                      This creates the first admin account for a new company workspace.
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