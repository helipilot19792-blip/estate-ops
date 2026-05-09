"use client";

import { LOCALE_LABELS, LOCALE_SHORT_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="fixed bottom-3 right-3 z-[999] rounded-full border border-[#d8c7ab] bg-[#fffdf9]/95 p-1 shadow-[0_14px_40px_rgba(36,28,21,0.16)] backdrop-blur sm:bottom-5 sm:right-5">
      <div className="flex items-center gap-1" role="group" aria-label={t("common.language")}>
        {SUPPORTED_LOCALES.map((option) => {
          const active = option === locale;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setLocale(option as Locale)}
              className={`min-h-9 rounded-full px-3 text-xs font-bold tracking-[0.08em] transition ${
                active
                  ? "bg-[#241c15] text-[#fff7ed] shadow-sm"
                  : "text-[#6f6255] hover:bg-[#f7f0e7] hover:text-[#241c15]"
              }`}
              aria-pressed={active}
              aria-label={LOCALE_LABELS[option]}
              title={LOCALE_LABELS[option]}
            >
              {LOCALE_SHORT_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
