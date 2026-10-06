"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";
import {availablePortals,type PortalAccess} from "@/lib/portal-access";
export default function PortalSwitcher({current}:{current:"owner"|"cleaner"|"grounds"}) {
  const [access,setAccess]=useState<PortalAccess|null>(null);
  const router=useRouter();
  useEffect(()=>{let active=true;async function load(){try{const {data}=await supabase.auth.getSession();if(!data.session)return;const r=await fetch("/api/portal-destination",{headers:{Authorization:`Bearer ${data.session.access_token}`},cache:"no-store"});const p=await r.json();if(active&&r.ok&&p.ok&&p.destination==="/choose-portal")setAccess(p.access);}catch{/* The current portal remains usable when the switcher cannot load. */}}void load();return()=>{active=false;};},[]);
  if(!access||availablePortals(access).length<2)return null;
  return <nav aria-label="Switch portal" className="border-b border-white/10 bg-[#0f0d0a] px-4 py-3 text-[#f7f1e8]"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2"><span className="mr-2 text-xs text-[#d9cbb6]">Your portals</span>{availablePortals(access).map(p=><button type="button" key={p.key} disabled={p.key===current} aria-current={p.key===current?"page":undefined} className="rounded-full border border-[#d8c7ab]/40 px-4 py-2 text-sm disabled:bg-[#d8c7ab] disabled:text-[#241c15]" onClick={()=>router.push(p.path)}>{p.label}</button>)}</div></nav>;
}
