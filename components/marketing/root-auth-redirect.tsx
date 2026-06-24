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
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single<ProfileRow>();

  if (profile?.role === "platform_admin" || profile?.role === "admin") {
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

export default function RootAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    async function routeUser() {
      const destination = await getPortalDestination();
      if (active && destination) {
        router.replace(destination);
      }
    }

    void routeUser();

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
