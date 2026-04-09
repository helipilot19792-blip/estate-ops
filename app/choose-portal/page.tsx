"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
};

export default function ChoosePortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("there");
  const [canUseCleaner, setCanUseCleaner] = useState(false);
  const [canUseGrounds, setCanUseGrounds] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const [{ data: profile }, { data: cleanerMemberships }, { data: groundsMemberships }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id,full_name,role")
            .eq("id", user.id)
            .single<ProfileRow>(),
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

      if (profile?.role === "admin") {
        router.replace("/admin");
        return;
      }

      const hasCleaner = !!cleanerMemberships?.length;
      const hasGrounds = !!groundsMemberships?.length;

      if (!hasCleaner && !hasGrounds) {
        router.replace("/login");
        return;
      }

      if (hasCleaner && !hasGrounds) {
        router.replace("/cleaner");
        return;
      }

      if (hasGrounds && !hasCleaner) {
        router.replace("/grounds");
        return;
      }

      if (!active) return;

      setDisplayName(profile?.full_name || "there");
      setCanUseCleaner(hasCleaner);
      setCanUseGrounds(hasGrounds);
      setLoading(false);
    }

    void loadAccess();

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050706] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-3xl border border-[#35543f]/40 bg-[#08110d] p-8 shadow-2xl">
          <div className="text-xs uppercase tracking-[0.32em] text-[#7fb685]">Gulera OS</div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">
            Loading your portals…
          </h1>
          <p className="mt-4 text-[#c7d7ca]">
            Checking your linked cleaner and grounds access.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050706] text-white flex items-center justify-center px-6">
      <div className="w-full max-w-3xl rounded-[34px] border border-[#35543f]/40 bg-[linear-gradient(135deg,#08110d_0%,#101713_55%,#11100e_100%)] p-8 shadow-2xl md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.32em] text-[#7fb685]">Gulera OS</div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">
              Choose your portal
            </h1>
            <p className="mt-4 max-w-xl text-[#c7d7ca]">
              Welcome, {displayName}. Your account is linked to more than one work lane.
              Pick the portal you want to use right now.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center justify-center rounded-full border border-[#35543f] px-5 py-3 text-sm font-medium text-[#eaf4ec] transition hover:bg-[#132019] disabled:opacity-60"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/cleaner")}
            disabled={!canUseCleaner}
            className="rounded-[28px] border border-[#3c3225] bg-[linear-gradient(135deg,#18120e_0%,#211913_100%)] p-6 text-left transition hover:-translate-y-[1px] hover:border-[#b48d4e] disabled:opacity-40"
          >
            <div className="text-xs uppercase tracking-[0.28em] text-[#d8c7ab]">Cleaner</div>
            <div className="mt-3 text-3xl font-semibold text-[#f8f2e8]">Cleaner Portal</div>
            <p className="mt-3 text-sm leading-6 text-[#dbcdbd]">
              Turnover jobs, property access, SOPs, and your cleaner job queue.
            </p>
          </button>

          <button
            type="button"
            onClick={() => router.push("/grounds")}
            disabled={!canUseGrounds}
            className="rounded-[28px] border border-[#35543f] bg-[linear-gradient(135deg,#08110d_0%,#0f1b15_100%)] p-6 text-left transition hover:-translate-y-[1px] hover:border-[#7fb685] disabled:opacity-40"
          >
            <div className="text-xs uppercase tracking-[0.28em] text-[#7fb685]">Grounds</div>
            <div className="mt-3 text-3xl font-semibold text-[#eef7ef]">Grounds Portal</div>
            <p className="mt-3 text-sm leading-6 text-[#c7d7ca]">
              Lawn, bins, snow, exterior work, and your grounds job queue.
            </p>
          </button>
        </div>
      </div>
    </main>
  );
}
