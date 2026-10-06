"use client";
import {useState} from "react";
export default function AnnouncementPreferences() {
  const [done,setDone]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  async function unsubscribe() {
    if(new URLSearchParams(window.location.search).get("test")==="1"){setError("This is a test email. No recipient preferences were changed.");return;}
    setBusy(true);setError("");
    try {const token=new URLSearchParams(window.location.search).get("token");const r=await fetch("/api/company-announcements/unsubscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});const result=await r.json();if(!r.ok)throw new Error(result.error);setDone(true);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-xl p-8"><section className="rounded-2xl border bg-white p-6"><h1 className="text-2xl font-semibold">Company announcement emails</h1><p className="mt-4">{done?"Your request has been recorded. You will no longer receive company announcement emails from this sender.":"You can stop company announcement, survey, and testimonial emails from this sender. Account access and operational messages are unaffected."}</p>{!done&&<button disabled={busy} onClick={()=>void unsubscribe()} className="mt-6 rounded-xl bg-[#241c15] px-5 py-3 text-white disabled:opacity-50">{busy?"Saving…":"Stop these emails"}</button>}{error&&<p role="alert" className="mt-4 text-red-700">{error}</p>}</section></main>;
}
