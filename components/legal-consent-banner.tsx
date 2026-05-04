"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CONSENT_KEY = "gulera_os_cookie_consent_v1";

type ConsentChoice = "essential" | "all";

export default function LegalConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!window.localStorage.getItem(CONSENT_KEY));
  }, []);

  function saveConsent(choice: ConsentChoice) {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        choice,
        acceptedAt: new Date().toISOString(),
        version: 1,
      })
    );
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[1000] mx-auto max-w-4xl rounded-[22px] border border-[#d8c7ab] bg-[#fffdf9] p-4 text-[#241c15] shadow-[0_24px_70px_rgba(36,28,21,0.2)] sm:bottom-5 sm:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold">Privacy and cookies</div>
          <p className="mt-1 text-sm leading-6 text-[#5f5245]">
            Gulera OS uses essential cookies and local browser storage for login, security, and core
            portal features. If analytics or optional tools are added during testing, they should
            only run after consent.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-[#7d581b]">
            <Link href="/terms" className="underline underline-offset-2">
              Terms
            </Link>
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy
            </Link>
            <Link href="/cookies" className="underline underline-offset-2">
              Cookies
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            type="button"
            onClick={() => saveConsent("essential")}
            className="rounded-full border border-[#d8c7ab] px-4 py-2 text-sm font-semibold text-[#241c15] transition hover:bg-[#f7f3ee]"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => saveConsent("all")}
            className="rounded-full bg-[#241c15] px-4 py-2 text-sm font-semibold text-[#f8f2e8] transition hover:bg-[#352a21]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
