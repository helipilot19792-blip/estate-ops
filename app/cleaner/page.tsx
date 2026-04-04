"use client";

import { useEffect, useState } from "react";
import CleanerShell from "@/components/cleaner/cleanershell";

export default function CleanerPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setHasMounted(true);

    const media = window.matchMedia("(max-width: 767px)");

    const updateMode = () => {
      setIsMobile(media.matches);
    };

    updateMode();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMode);
      return () => media.removeEventListener("change", updateMode);
    }

    media.addListener(updateMode);
    return () => media.removeListener(updateMode);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return <CleanerShell mode={isMobile ? "mobile" : "desktop"} />;
}