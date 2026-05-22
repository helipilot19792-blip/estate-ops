import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import LanguageSwitcher from "@/components/language-switcher";
import LegalConsentBanner from "@/components/legal-consent-banner";
import HelpAssistant from "@/components/help/helpassistant";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Estate of Mind Portal",
  description: "Cleaner scheduling and STR operations portal",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <I18nProvider>
          <LanguageSwitcher />
          {children}
          <HelpAssistant />
          <LegalConsentBanner />
        </I18nProvider>
      </body>
    </html>
  );
}
