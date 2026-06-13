import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppClientChrome from "@/components/app-client-chrome";
import { I18nProvider } from "@/components/i18n-provider";
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
  appleWebApp: {
    capable: true,
    title: "Gulera OS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/gulera-pwa-icon-192.png?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f0d0a",
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
          <AppClientChrome />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
