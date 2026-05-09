"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

export default function WelcomePage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0e0e0e] text-white">
      <div className="w-full max-w-xl space-y-6 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-8">
        <h1 className="text-2xl font-semibold">{t("welcome.title")}</h1>

        <p className="text-sm text-gray-400">{t("welcome.body")}</p>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/admin")}
            className="w-full rounded-xl bg-[#b48d4e] py-3 font-medium text-black hover:opacity-90"
          >
            {t("welcome.dashboard")}
          </button>

          <button
            onClick={() => router.push("/admin?open=add-property")}
            className="w-full rounded-xl border border-[#2a2a2a] py-3 font-medium hover:bg-[#222]"
          >
            {t("welcome.firstProperty")}
          </button>
        </div>

        <p className="text-center text-xs text-gray-500">{t("welcome.footer")}</p>
      </div>
    </div>
  );
}
