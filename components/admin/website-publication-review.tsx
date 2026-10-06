"use client";
import {useState} from "react";
import ListingContent from "@/components/public/listing-content";
import {publicationDiff,type PublicDTO} from "@/lib/website-publication";
export default function WebsitePublicationReview({draft,published,draftRevision,publishedRevision,siteId,listingId,generation,candidateGeneration,configurationRevision,onClose}:{
  draft:PublicDTO;published:PublicDTO|null;draftRevision:number;publishedRevision:number|null;siteId?:string;listingId?:string;generation:number;candidateGeneration:number;configurationRevision:number;onClose:()=>void;
}) {
  const [view,setView]=useState<"draft"|"published">("draft");
  const [mobile,setMobile]=useState(false);
  const changes=publicationDiff(published,draft),selected=view==="published"&&published?published:draft;
  const revision=view==="published"?publishedRevision:draftRevision;
  const selectedGeneration=view==="published"?generation:candidateGeneration;
  const payload={schemaVersion:1,scope:"PROPERTY",...(siteId?{siteId}:{}),...(listingId?{listingId}:{}),publicationRevision:revision,generation:selectedGeneration,configurationRevision,
    ...(siteId&&listingId?{idempotencyKey:`${siteId}:${listingId}:${selectedGeneration}:${configurationRevision}`} : {}),operation:"upsert",property:selected};
  return <section className="space-y-5 rounded-[24px] border border-[#d8c7ab] bg-[#f7f3ee] p-4 md:p-6" aria-label="Private website preview">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#8a7b68]">Private website preview</p><h4 className="text-xl font-semibold">Review your property publication</h4><p className="mt-1 text-sm text-[#7f7263]">A hospitality preview of approved public fields. Your website controls its own design.</p></div><button className="rounded-xl border px-3 py-2 text-sm" onClick={onClose}>Close preview</button></div>
    <div className="flex flex-wrap gap-2"><button aria-pressed={view==="draft"} className="rounded-full border bg-white px-4 py-2 text-sm" onClick={()=>setView("draft")}>Working draft</button>{published&&<button aria-pressed={view==="published"} className="rounded-full border bg-white px-4 py-2 text-sm" onClick={()=>setView("published")}>Approved snapshot · Revision {publishedRevision}</button>}<button className="ml-auto rounded-full border bg-white px-4 py-2 text-sm" onClick={()=>setMobile(v=>!v)}>{mobile?"Desktop view":"Mobile view"}</button></div>
    {view==="draft"&&published&&<details open className="rounded-2xl bg-white p-4 text-sm"><summary className="font-semibold">{changes.length?`${changes.length} public changes to review`:"No public content changes"}</summary>{changes.length>0&&<ul className="mt-2 space-y-1">{changes.map((c,i)=><li key={i}><span className="mr-2 capitalize text-[#8a7b68]">{c.kind}</span>{c.summary}</li>)}</ul>}</details>}
    <div className={`mx-auto w-full transition-[max-width] ${mobile?"max-w-[390px]":"max-w-5xl"}`}><ListingContent listing={selected}/></div>
    <details className="rounded-2xl border border-[#d8c7ab] bg-white p-4 text-sm"><summary className="cursor-pointer font-semibold">Advanced · Sanitized connector payload</summary><p className="my-2 text-[#7f7263]">{view==="draft"?"Candidate payload if this draft is approved next. No delivery occurs during preview.":"Current approved publication payload."}{!listingId&&" Save the marketing profile first to allocate a stable listing identity."}</p><pre className="max-h-96 overflow-auto rounded-xl bg-[#241c15] p-4 text-xs text-white">{JSON.stringify(payload,null,2)}</pre></details>
  </section>;
}
