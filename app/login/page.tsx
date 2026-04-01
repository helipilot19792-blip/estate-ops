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
  const [loadingReset, setLoadingReset] = useState(false);

  // 🔥 LOGIN
  async function handleLogin(e?: React.FormEvent) {
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

      if (profile.role === "admin") {
        router.push("/admin");
        return;
      }

      router.push("/cleaner");
    } finally {
      setLoadingLogin(false);
    }
  }

  // 🔥 PASSWORD RESET
  async function handleResetPassword() {
    setError("");
    setMessage("");

    if (!loginEmail.trim()) {
      setError("Enter your email above first.");
      return;
    }

    setLoadingReset(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        loginEmail.trim(),
        {
          redirectTo: `${window.location.origin}/auth/reset`,
        }
      );

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Password reset email sent.");
    } finally {
      setLoadingReset(false);
    }
  }

  // 🔥 SIGNUP (unchanged)
  async function handleSignup() {
    setError("");
    setMessage("");

    if (!signupName.trim()) return setError("Please enter your full name.");
    if (!signupPhone.trim()) return setError("Please enter your phone number.");
    if (!signupEmail.trim()) return setError("Please enter your email.");
    if (!signupPassword) return setError("Please enter a password.");
    if (signupPassword !== signupConfirmPassword)
      return setError("Passwords do not match.");

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
        await supabase.from("profiles").update({
          full_name: signupName.trim(),
          phone: signupPhone.trim(),
        }).eq("id", userId);
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

      setMessage("Confirmation email sent.");
    } finally {
      setLoadingResend(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#241c15]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center p-4 md:p-6">
        <div className="grid w-full overflow-hidden rounded-[34px] border border-[#e7ddd0] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.08)] lg:grid-cols-2">

          {/* LEFT SIDE */}
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
                Sign in to manage operations or request cleaner access.
              </p>

              {/* 🔥 BACK TO MAIN SITE */}
              <a
                href="https://estateofmindpm.com"
                className="inline-block mt-6 text-sm text-[#d8c7ab] underline hover:text-white"
              >
                ← Back to main website
              </a>
            </div>
          </section>

          {/* RIGHT SIDE */}
          <section className="bg-white px-6 py-8 md:px-10 md:py-12">
            <div className="mx-auto max-w-xl">

              {error && (
                <div className="mb-4 rounded-[20px] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22]">
                  {error}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-[20px] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                  {message}
                </div>
              )}

              {/* 🔥 LOGIN FORM (ENTER WORKS NOW) */}
              <form onSubmit={handleLogin} className="space-y-3">
                <input
                  className="w-full rounded-[20px] border px-4 py-3"
                  type="email"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />

                <input
                  className="w-full rounded-[20px] border px-4 py-3"
                  type={showLoginPassword ? "text" : "password"}
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />

                <button
                  type="submit"
                  className="rounded-full bg-black text-white px-5 py-3"
                  disabled={loadingLogin}
                >
                  {loadingLogin ? "Logging in..." : "Login"}
                </button>
              </form>

              {/* 🔥 NEW ACTIONS */}
              <div className="mt-4 flex gap-4 text-sm">
                <button onClick={handleResetPassword} disabled={loadingReset}>
                  {loadingReset ? "Sending..." : "Forgot password?"}
                </button>

                <button onClick={handleResendConfirmation}>
                  Resend confirmation
                </button>
              </div>

            </div>
          </section>
        </div>
      </div>
    </main>
  );
}