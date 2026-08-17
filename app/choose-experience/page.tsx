import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ExperienceChooser from "@/components/experience/experience-chooser";
import { isGuleraOsV2Enabled } from "@/lib/server/admin-v2/feature";

export const metadata: Metadata = {
  title: "Choose your Gulera experience",
  description: "Choose between Classic Gulera and the read-only Gulera OS 2.0 preview.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ChooseExperiencePage() {
  if (!isGuleraOsV2Enabled()) {
    redirect("/admin");
  }

  return <ExperienceChooser />;
}
