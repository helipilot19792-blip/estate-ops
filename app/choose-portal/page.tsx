"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {availablePortals,type PortalAccess} from "@/lib/portal-access";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string;
};

async function loadPortalDestination(accessToken: string) {
  const response = await fetch("/api/portal-destination", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "Could not check your portal access.");
  }

  return result as {
    destination: string;
    profile: ProfileRow | null;
    access: PortalAccess;
  };
}

export default function ChoosePortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("there");
  const [access, setAccess] = useState<PortalAccess>({cleaner:false,grounds:false,owner:false});
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          router.replace("/login");
          return;
        }

        const portal = await loadPortalDestination(session.access_token);
        const profile = portal.profile;

        if (portal.destination !== "/choose-portal") {
          router.replace(portal.destination);
          return;
        }

        if (!active) return;

        setDisplayName(profile?.full_name || "there");
        setAccess(portal.access);
        setLoading(false);
      } catch {
        router.replace("/login");
      }
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
            Checking your linked owner, cleaner, and grounds access.
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
              Welcome, {displayName}. Your login has access to more than one portal.
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
          {availablePortals(access).map(portal=><button key={portal.key} type="button" onClick={()=>router.push(portal.path)} className="rounded-[28px] border border-[#35543f] bg-[#0f1b15] p-6 text-left transition hover:-translate-y-[1px] hover:border-[#7fb685]"><div className="text-xs uppercase tracking-[0.28em] text-[#d8c7ab]">{portal.key}</div><div className="mt-3 text-3xl font-semibold text-[#eef7ef]">{portal.label}</div><p className="mt-3 text-sm leading-6 text-[#c7d7ca]">{portal.description}</p></button>)}
        </div>
      </div>
    </main>
  );
}
