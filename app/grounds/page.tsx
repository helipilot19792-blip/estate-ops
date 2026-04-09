"use client";

import { useEffect, useState } from "react";
import GroundsShell from "@/components/grounds/groundsshell";

export default function GroundsPage() {
  const [mode, setMode] = useState<"desktop" | "mobile">("desktop");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const apply = () => setMode(media.matches ? "mobile" : "desktop");
    apply();

    const listener = () => apply();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  return <GroundsShell mode={mode} />;
}
