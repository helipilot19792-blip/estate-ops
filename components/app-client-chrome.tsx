"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const LanguageSwitcher = dynamic(() => import("@/components/language-switcher"), {
  ssr: false,
});

const LegalConsentBanner = dynamic(() => import("@/components/legal-consent-banner"), {
  ssr: false,
});

const HelpAssistant = dynamic(() => import("@/components/help/helpassistant"), {
  ssr: false,
});

export default function AppClientChrome() {
  const [loadDeferredChrome, setLoadDeferredChrome] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const reveal = () => setLoadDeferredChrome(true);

    if ("requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(reveal, { timeout: 1500 });
    } else {
      timeoutId = globalThis.setTimeout(reveal, 250);
    }

    return () => {
      if (idleId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <>
      <LanguageSwitcher />
      {loadDeferredChrome ? (
        <>
          <HelpAssistant />
          <LegalConsentBanner />
        </>
      ) : null}
    </>
  );
}
