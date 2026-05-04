"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getQueryParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

export default function OwnerLoginPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function handleSwitchAccount() {
    setCheckingSession(true);
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    setStatusMessage("Signed out. Enter the owner email you want to use.");
    setCheckingSession(false);
  }

  useEffect(() => {
    let mounted = true;

    async function boot() {
      const emailFromQuery = getQueryParam("email");
      const messageFromQuery = getQueryParam("message");

      if (mounted && emailFromQuery) {
        setEmail(emailFromQuery);
      }

      if (mounted && messageFromQuery === "password_set") {
        setStatusMessage("Password saved. Please log in with your email and password.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        const switchAccount = getQueryParam("switch");
        if (switchAccount === "1") {
          await supabase.auth.signOut();
          if (mounted) {
            setStatusMessage("Signed out. Enter the owner email you want to use.");
            setCheckingSession(false);
          }
          return;
        }

        router.replace("/owner");
        return;
      }

      setCheckingSession(false);
    }

    void boot();

    return () => {
      mounted = false
    }
  }, [router]);

  const canSubmitPassword = useMemo(() => {
    return !!email.trim() && !!password.trim()
  }, [email, password])

  async function handlePasswordLogin() {
    if (!email.trim() || !password.trim()) {
      setError("Enter your email and password.");
      return;
    }

    setSigningIn(true)
    setError("")
    setStatusMessage("")

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSigningIn(false)
      return;
    }

    router.push("/owner");
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setSendingLink(true)
    setError("")
    setStatusMessage("")

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/owner/welcome?owner_email=${encodeURIComponent(
            email.trim().toLowerCase()
          )}`
        : undefined;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (otpError) {
      setError(otpError.message);
      setSendingLink(false)
      return;
    }

    setStatusMessage("Login link sent. Check your email.");
    setSendingLink(false)
  }

  if (checkingSession) {
    return (
      <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
        <div className="owner-card mx-auto max-w-md rounded-[32px] border border-white/8 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
          <div className="text-sm text-[#e6d8bf]">Checking your owner session...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="owner-shell min-h-screen px-4 py-8 text-[#f7f1e8] sm:px-6">
      <div className="mx-auto max-w-md space-y-6">
        <section className="owner-hero rounded-[32px] border border-white/8 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.36)] sm:px-8">
          <div className="text-[11px] uppercase tracking-[0.24em] text-[#e7c98a]">
            Gulera OS Owner Portal
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#f7f1e8] sm:text-4xl">
            Owner Login
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[#e6d8bf]">
            Sign in with your email and password. You can also request a fresh login link if needed.
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-500/25 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
            {statusMessage}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-[#e6d8bf]">
          Already stuck in the wrong owner session?{" "}
          <button
            type="button"
            onClick={() => void handleSwitchAccount()}
            className="font-semibold text-[#e7c98a] underline"
          >
            Sign out and switch account
          </button>
        </div>

       <section className="owner-card rounded-[28px] border border-white/8 p-5 sm:p-6">
  <form
    className="space-y-4"
    onSubmit={(e) => {
      e.preventDefault();
      void handlePasswordLogin();
    }}
  >
    <div>
      <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Email</label>
      <input
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="owner-field mt-2 w-full rounded-2xl border border-white/8 px-4 py-3 text-sm text-[#f7f1e8] outline-none transition focus:border-[#b08b47]"
        placeholder="you@example.com"
      />
    </div>

    <div>
      <label className="text-xs uppercase tracking-[0.18em] text-[#e7c98a]">Password</label>
      <div className="owner-field mt-2 flex rounded-2xl border border-white/8 focus-within:border-[#b08b47]">
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm text-[#f7f1e8] outline-none"
          placeholder="Enter your password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="rounded-r-2xl px-4 text-sm font-medium text-[#e6d8bf]"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </div>

    <div className="flex flex-wrap gap-3 pt-2">
      <button
        type="submit"
        disabled={signingIn || !canSubmitPassword}
        className="rounded-full bg-[#b08b47] px-5 py-2.5 text-sm font-semibold text-[#17120d] transition hover:brightness-110 disabled:opacity-60"
      >
        {signingIn ? "Signing in..." : "Log In"}
      </button>

      <button
        type="button"
        onClick={() => void handleMagicLink()}
        disabled={sendingLink || !email.trim()}
        className="rounded-full border border-white/12 px-5 py-2.5 text-sm font-semibold text-[#f7f1e8] transition hover:bg-white/[0.05] disabled:opacity-60"
      >
        {sendingLink ? "Sending..." : "Email Me a Login Link"}
      </button>
    </div>
  </form>
</section>
        <div className="text-center text-xs leading-6 text-[#ccb99a]">
          By using the owner portal, you agree to the{" "}
          <Link href="/terms" className="font-semibold text-[#e7c98a] underline">
            Terms
          </Link>
          ,{" "}
          <Link href="/privacy" className="font-semibold text-[#e7c98a] underline">
            Privacy Policy
          </Link>
          , and{" "}
          <Link href="/cookies" className="font-semibold text-[#e7c98a] underline">
            Cookie Notice
          </Link>
          .
        </div>
      </div>
    </main>
  );
}
