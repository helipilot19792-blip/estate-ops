import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminV2Shell from "@/components/admin-v2/admin-v2-shell";
import { isGuleraOsV2Enabled } from "@/lib/server/admin-v2/feature";

export const metadata: Metadata = {
  title: "Gulera OS 2.0 Preview",
  description: "A calm, guided operating system for short-term rental owners.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminV2Page() {
  if (!isGuleraOsV2Enabled()) {
    redirect("/admin");
  }

  return <AdminV2Shell />;
}
