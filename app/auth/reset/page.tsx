"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy";
import { supabase } from "@/lib/supabase";

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

  useEffect(() => {
    async function initResetSession() {
      setError("");

      try {
        const url = new URL(window.location.href);
        const queryParams = url.searchParams;
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

        const code = queryParams.get("code");
        const tokenHash = queryParams.get("token_hash");
        const tokenType = queryParams.get("type") || "recovery";
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message);
            setInitializing(false);
            return;
          }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType as any,
          });
          if (error) {
            setError(error.message);
            setInitializing(false);
            return;
          }
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setError(error.message);
            setInitializing(false);
            return;
          }
        } else {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) {
            setError("Reset link is invalid or expired. Please request a new password reset email from the login page.");
            setInitializing(false);
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError("Reset session could not be prepared. Please request a new password reset email from the login page.");
          setInitializing(false);
          return;
        }

        window.history.replaceState({}, document.title, "/auth/reset");
      } catch (err: any) {
        setError(err?.message || "Could not initialize reset session.");
      } finally {
        setInitializing(false);
      }
    }

    void initResetSession();
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Password updated successfully. Redirecting to login...");
      window.setTimeout(() => {
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
              <h1 className="text-3xl font-semibold md:text-4xl">Reset Password</h1>
              <p className="mt-4 text-sm text-[#e7dccb]">
                Enter your new password below to regain access.
              </p>
            </div>
          </section>

          <section className="bg-white px-6 py-8 md:px-10 md:py-12">
            <div className="mx-auto max-w-xl">
              {error ? (
                <div className="mb-4 rounded-[20px] border border-[#e7c6c1] bg-[#fff4f2] px-4 py-3 text-sm text-[#8a2e22]">
                  {error}
                </div>
              ) : null}

              {message ? (
                <div className="mb-4 rounded-[20px] border border-[#d8c7ab] bg-[#fcfaf7] px-4 py-3 text-sm text-[#5f5245]">
                  {message}
                </div>
              ) : null}

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-[20px] border px-4 py-3"
                    disabled={initializing}
                  />
                  <p className="mt-1 px-1 text-xs text-[#7f7263]">{PASSWORD_REQUIREMENTS}</p>
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="mt-2 text-sm text-[#5f5245] underline underline-offset-2"
                  >
                    {showPassword ? "Hide password" : "Show password"}
                  </button>
                </div>

                <div>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-[20px] border px-4 py-3"
                    disabled={initializing}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="mt-2 text-sm text-[#5f5245] underline underline-offset-2"
                  >
                    {showConfirmPassword ? "Hide confirmation" : "Show confirmation"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={loading || initializing}
                    className="rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {initializing ? "Preparing..." : loading ? "Updating..." : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/login")}
                    className="rounded-full border border-[#d9ccbb] bg-white px-5 py-3 text-sm font-medium text-[#5f5245]"
                  >
                    Back to Login
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
