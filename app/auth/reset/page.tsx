"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // 🔥 FIXED TOKEN HANDLING
  useEffect(() => {
    async function initResetSession() {
      setError("");

      try {
        const hash = window.location.hash.replace("#", "");
        const params = new URLSearchParams(hash);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        // ✅ DO NOT CHECK "type" — this was breaking your flow
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setError(error.message);
            setInitializing(false);
            return;
          }

          // stabilize session
          await supabase.auth.getUser();

          // clean URL
          window.history.replaceState({}, document.title, "/auth/reset");

          setInitializing(false);
          return;
        }

        // fallback check
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError("Reset link is invalid or expired. Please request a new password reset email.");
        }
      } catch (err: any) {
        setError(err?.message || "Could not initialize reset session.");
      } finally {
        setInitializing(false);
      }
    }

    initResetSession();
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!password) {
      setError("Please enter a new password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Password updated successfully. Redirecting to login...");

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } finally {
      setLoading(false);
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
                  src="/guleraoslogo.png"
                  alt="Gulera OS"
                  width={420}
                  height={180}
                  className="h-auto w-full max-w-[320px]"
                  priority
                />
              </div>

              <div className="mb-2 text-xs uppercase tracking-[0.32em] text-[#d8c7ab]">
                Luxury Operations Portal
              </div>

              <h1 className="text-3xl font-semibold md:text-4xl">
                Reset Password
              </h1>

              <p className="mt-4 text-sm text-[#e7dccb]">
                Enter your new password below to regain access.
              </p>
            </div>
          </section>

          {/* RIGHT SIDE */}
          <section className="bg-white px-6 py-8 md:px-10 md:py-12">
            <div className="mx-auto max-w-xl">

              {error && (
                <div className="mb-4 rounded-[20px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22]">
                  {error}
                </div>
              )}

              {message && (
                <div className="mb-4 rounded-[20px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                  {message}
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-4">

                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-[20px] border px-4 py-3"
                  disabled={initializing}
                />

                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-[20px] border px-4 py-3"
                  disabled={initializing}
                />

                <button
                  type="submit"
                  disabled={loading || initializing}
                  className="w-full rounded-full bg-[#241c15] text-white py-3"
                >
                  {initializing ? "Preparing..." : loading ? "Updating..." : "Update Password"}
                </button>

              </form>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}