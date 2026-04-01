"use client";

import Image from "next/image";
import { useState } from "react";
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
      }, 1800);
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
                Reset Password
              </h1>

              <p className="mt-4 text-sm leading-7 text-[#e7dccb] md:text-base">
                Enter your new password below to regain access to the portal.
              </p>

              <a
                href="https://estateofmindpm.com"
                className="inline-block mt-6 text-sm text-[#d8c7ab] underline hover:text-white"
              >
                ← Back to main website
              </a>
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

              <section className="rounded-[28px] border border-[#e7ddd0] bg-[#fcfaf7] p-5 shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight">Choose New Password</h2>
                <p className="mt-1 text-sm text-[#7f7263]">
                  Your new password will replace your old one.
                </p>

                <form onSubmit={handleResetPassword} className="mt-5 space-y-3">
                  <div className="relative">
                    <input
                      className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      type={showPassword ? "text" : "password"}
                      placeholder="New password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      👁
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      className="w-full rounded-[20px] border border-[#d9ccbb] bg-white px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-[#a39584] focus:border-[#b48d4e]"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b68] hover:text-[#241c15]"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      👁
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-full bg-[#241c15] px-5 py-3 text-sm font-medium text-[#f8f2e8] shadow-[0_10px_24px_rgba(36,28,21,0.18)] transition hover:bg-[#352a21] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={loading}
                    >
                      {loading ? "Updating..." : "Update Password"}
                    </button>

                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full border border-[#d9ccbb] bg-white px-5 py-3 text-sm font-medium text-[#5f5245] shadow-sm transition hover:bg-[#fcfaf7] active:scale-[0.98] cursor-pointer"
                      onClick={() => router.push("/login")}
                    >
                      Back to Login
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}