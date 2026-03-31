"use client";

import Image from "next/image";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
};

export default function LoginPage() {
  const router = useRouter();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loadingSignup, setLoadingSignup] = useState(false);
  const [loadingResend, setLoadingResend] = useState(false);

  async function handleLogin() {
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

      if (profile.role === "admin") {
        router.push("/admin");
        return;
      }

      router.push("/cleaner");
    } finally {
      setLoadingLogin(false);
    }
  }

  async function handleSignup() {
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
      setError("Please enter your email.");
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
          })
          .eq("id", userId);

        if (profileError) {
          setError(profileError.message);
          return;
        }
      }

      setMessage("Check your email to confirm your account.");
      setSignupName("");
      setSignupPhone("");
      setSignupEmail("");
      setSignupPassword("");
      setSignupConfirmPassword("");
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

      setMessage("If that account is awaiting confirmation, a new email has been sent.");
    } finally {
      setLoadingResend(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center p-4 md:p-6">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)] lg:grid-cols-2">
          <section className="bg-[linear-gradient(135deg,#1f1812_0%,#2a2119_55%,#3a2c1d_100%)] px-6 py-8 text-white md:px-10 md:py-12">
            <div className="max-w-md">
              <div className="mb-6">
                <Image
                  src="/eomlogo.png"
                  alt="Estate of Mind Property Management"
                  width={420}
                  height={180}
                  className="h-auto w-full max-w-[320px]"
                  priority
                />
              </div>

              <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                Luxury Operations Portal
              </div>

              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Cleaner & Admin Access
              </h1>

              <p className="mt-4 text-sm leading-7 text-[#e7dccb] md:text-base">
                Sign in to manage operations, or create an account to request
                cleaner access. New accounts are created as pending until an
                admin approves them and assigns properties.
              </p>
            </div>
          </section>

          <section className="bg-white px-6 py-8 md:px-10 md:py-12">
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

              <div className="grid gap-6">
                <section className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-5 shadow-sm">
                  <h2 className="text-2xl font-semibold tracking-tight">Login</h2>
                  <p className="mt-1 text-sm text-[#7f7263]">
                    Existing admin or cleaner account
                  </p>

                  <div className="mt-5 space-y-3">
                    <input
                      className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      type="email"
                      placeholder="Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />

                    <div className="relative">
                      <input
                        className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
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
                        className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleLogin}
                        disabled={loadingLogin}
                      >
                        {loadingLogin ? "Logging in..." : "Login"}
                      </button>

                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-full border border-[#d9ccbb] bg-white px-5 py-3 text-sm font-medium text-[#5f5245] shadow-sm transition hover:bg-[#fcfaf7] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={handleResendConfirmation}
                        disabled={loadingResend}
                      >
                        {loadingResend ? "Sending..." : "Resend confirmation"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[#e7ddd0] bg-white p-5 shadow-sm">
                  <h2 className="text-2xl font-semibold tracking-tight">Sign Up</h2>
                  <p className="mt-1 text-sm text-[#7f7263]">
                    Request cleaner access
                  </p>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <input
                      className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                      type="text"
                      placeholder="Full name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                    />

                    <input
                      className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                      type="text"
                      placeholder="Phone number"
                      value={signupPhone}
                      onChange={(e) => setSignupPhone(e.target.value)}
                    />

                    <input
                      className="md:col-span-2 w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                      type="email"
                      placeholder="Email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />

                    <div className="relative">
                      <input
                        className="w-full rounded-[20px] border border-[#d9ccbb] bg-[#fcfaf7] px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e] focus:bg-white"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="Password"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
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
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                        onClick={() =>
                          setShowSignupConfirmPassword(!showSignupConfirmPassword)
                        }
                      >
                        👁
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <button
                      className="inline-flex items-center justify-center rounded-full bg-[#b48d4e] px-5 py-3 text-sm font-medium text-white shadow-[0_10px_24px_rgba(180,141,78,0.25)] transition hover:bg-[#a27d43] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleSignup}
                      disabled={loadingSignup}
                    >
                      {loadingSignup ? "Creating account..." : "Create Account"}
                    </button>
                  </div>

                  <p className="mt-4 text-xs leading-6 text-[#8a7b68]">
                    New signups are created as pending. Admin approval and
                    property assignment are required before cleaner access is
                    granted.
                  </p>
                </section>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}