"use client";

import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-white flex items-center justify-center">
      <div className="w-full max-w-xl p-8 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] space-y-6">
        <h1 className="text-2xl font-semibold">
          Welcome to Gulera OS
        </h1>

        <p className="text-sm text-gray-400">
          Let’s get your system set up in a couple quick steps.
        </p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/admin")}
            className="w-full rounded-xl bg-[#b48d4e] text-black py-3 font-medium hover:opacity-90"
          >
            Go to Dashboard
          </button>

          <button
            onClick={() => router.push("/admin?open=add-property")}
            className="w-full rounded-xl border border-[#2a2a2a] py-3 font-medium hover:bg-[#222]"
          >
            Create your first property
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          You can always come back here later from your dashboard.
        </p>
      </div>
    </div>
  );
}