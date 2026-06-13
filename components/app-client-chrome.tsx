"use client";

import dynamic from "next/dynamic";

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
  return (
    <>
      <LanguageSwitcher />
      <HelpAssistant />
      <LegalConsentBanner />
    </>
  );
}
