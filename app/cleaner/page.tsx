"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CleanerShell from "@/components/cleaner/cleanershell";

export default function CleanerPage() {
  const router = useRouter();

  const [hasMounted, setHasMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    setHasMounted(true);

    const media = window.matchMedia("(max-width: 767px)");

    const updateMode = () => {
      setIsMobile(media.matches);
    };

    updateMode();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateMode);
    } else {
      media.addListener(updateMode);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateMode);
      } else {
        media.removeListener(updateMode);
      }
    };
  }, []);

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCheckingAuth(false);
    }

    checkAuth();
  }, [router]);

  // 🔴 BLOCK RENDER UNTIL AUTH + MOUNT READY
  if (!hasMounted || checkingAuth) {
    return (
      <main className="min-h-screen bg-[#0f0d0a] flex items-center justify-center text-[#f5efe4]">
        <div className="text-sm text-[#cdbda0]">Loading cleaner dashboard...</div>
      </main>
    );
  }

  return <CleanerShell mode={isMobile ? "mobile" : "desktop"} />;
}