"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  role: string;
};

async function getPortalDestination() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/login";
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (profile?.role === "admin") {
    return "/admin";
  }

  const [{ data: cleanerMemberships }, { data: groundsMemberships }] = await Promise.all([
    supabase
      .from("cleaner_account_members")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1),
    supabase
      .from("grounds_account_members")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1),
  ]);

  const hasCleaner = !!cleanerMemberships?.length;
  const hasGrounds = !!groundsMemberships?.length;

  if (hasCleaner && hasGrounds) return "/choose-portal";
  if (hasCleaner) return "/cleaner";
  if (hasGrounds) return "/grounds";
  return "/login";
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function routeUser() {
      const destination = await getPortalDestination();
      if (active) {
        router.replace(destination);
      }
    }

    void routeUser();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-[#050706] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-3xl border border-[#35543f]/40 bg-[#08110d] p-8 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.32em] text-[#7fb685]">Gulera OS</div>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">
          Redirecting…
        </h1>
        <p className="mt-4 text-[#c7d7ca]">
          Checking your access and sending you to the right portal.
        </p>
      </div>
    </main>
  );
}
