"use client";

import { useEffect, useState } from "react";
import CleanerShell from "@/components/cleaner/cleanershell";
import PortalLoadingScene from "@/components/portal/portal-loading-scene";

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
      <main className="staff-shell cleaner-shell min-h-screen bg-[#0f0d0a] px-4 py-6 text-[#241c15] md:px-6">
        <div className="mx-auto max-w-7xl">
          <PortalLoadingScene
            eyebrow="Cleaner portal"
            title="Rolling into the cleaning board."
            body="Assigned cleanings, access details, and checklist progress are loading now. The mower is keeping things tidy while the cleaner portal wakes up."
            badge="Loading jobs"
          />
        </div>
      </main>
    );
  }

  return <CleanerShell mode={isMobile ? "mobile" : "desktop"} />;
}
