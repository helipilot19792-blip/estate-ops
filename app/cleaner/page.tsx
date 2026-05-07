"use client";

import { useEffect, useState } from "react";
import CleanerShell from "@/components/cleaner/cleanershell";

export default function CleanerPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const updateMode = () => {
      setIsMobile(media.matches);
    };

    const mountTimeout = window.setTimeout(() => {
      setHasMounted(true);
    }, 0);

    updateMode();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMode);
    } else {
      media.addListener(updateMode);
    }

    return () => {
      window.clearTimeout(mountTimeout);

      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateMode);
      } else {
        media.removeListener(updateMode);
      }
    };
  }, []);

  if (!hasMounted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#0f0d0a] text-[#f5efe4]">
        <div className="text-sm text-[#cdbda0]">Loading cleaner dashboard...</div>
      </main>
    );
  }

  return <CleanerShell mode={isMobile ? "mobile" : "desktop"} />;
}
