"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function LegacyResetPasswordPage() {
  useEffect(() => {
    const destination = `/auth/reset${window.location.search}${window.location.hash}`;
    window.location.replace(destination);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f3ee] p-6 text-[#241c15]">
      <section className="max-w-md rounded-[28px] border border-[#e7ddd0] bg-white p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.08)]">
        <h1 className="text-2xl font-semibold">Redirecting to reset password</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f6254]">
          Taking you to the current password reset page. Your reset link details are preserved.
        </p>
        <Link
          href="/auth/reset"
          className="mt-5 inline-flex rounded-full bg-[#241c15] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Continue
        </Link>
      </section>
    </main>
  );
}
