"use client";

import { useEffect, useState } from "react";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";
import MyAccountControl from "@/components/my-account-control";
import { supabase } from "@/lib/supabase";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSignedIn(Boolean(data.session));
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSignedIn(Boolean(session));
      setAuthChecked(true);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="border-b border-[#e7ddd0] bg-[#fffdf9] px-4 py-2 text-[#241c15]">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-end gap-2">
        <MyAccountControl />
        {authChecked && !signedIn ? (
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#6f6255]">
            <span>{t("common.language")}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              className="rounded-full border border-[#d8c7ab] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#241c15] outline-none transition hover:bg-[#fcfaf7] focus:border-[#b48d4e]"
            >
              {SUPPORTED_LOCALES.map((option) => (
                <option key={option} value={option}>
                  {LOCALE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
