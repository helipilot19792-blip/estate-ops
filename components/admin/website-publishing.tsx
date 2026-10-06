"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import WebsitePublicationReview from "@/components/admin/website-publication-review";
import {publicationDiff,candidateGeneration,type PublicDTO,type PublishingMode} from "@/lib/website-publication";
import type {ConnectorConfiguration} from "@/lib/website-property-connector";
import { DEFAULT_SETTINGS, FEATURE_KEYS, normalizeProfile, normalizeSettings, readiness, serializePublicListing, slugify, type MarketingProfile, type PropertyFacts, type PublicationState } from "@/lib/website-publishing";
import { CONNECTOR_TYPES, type ConnectorType } from "@/lib/website-connectors";

const inputStyle = "w-full rounded-xl border border-[#d9ccbb] bg-white px-3 py-2 text-sm";
const buttonStyle = "rounded-xl border border-[#d9ccbb] bg-white px-4 py-2 text-sm disabled:opacity-50";
type Connection = {id?:string; name:string; website_url:string; connector_type:ConnectorType; enabled:boolean; auto_update:boolean; status?:string; settings:typeof DEFAULT_SETTINGS;publishing_mode?:PublishingMode;configuration?:ConnectorConfiguration;config_revision?:number;last_successful_sync?:string;last_test_at?:string;last_test_result?:{ok:boolean;code:string}};
type Job = {id:string; operation:string; status:string; attempts:number; last_error:string|null;next_retry_at?:string;lease_until?:string};
type Listing = {profile:MarketingProfile; state:PublicationState; revision:number; last_sync_at:string|null; published_at:string|null; last_published_at:string|null;listing_id?:string;published_revision?:number;published_by?:string;publication_generation?:number;published_profile?:MarketingProfile;published_facts?:PropertyFacts};
const emptyFacts: PropertyFacts = {property_type:null,bedrooms:null,bathrooms:null,max_guests:null,beds:null};
const emptyConnection: Connection = {name:"My website",website_url:"",connector_type:"GULERA_SITE",enabled:false,auto_update:false,settings:DEFAULT_SETTINGS,publishing_mode:"MANUAL_APPROVAL",configuration:{adapter:"GENERIC",transport:"UNCONFIGURED"}};

async function api(organizationId:string,propertyId?:string,body?:unknown) {
  const {data} = await supabase.auth.getSession();
  const response = await fetch(`/api/admin/website-publishing?organizationId=${organizationId}${propertyId?`&propertyId=${propertyId}`:""}`,{
    method:body?"POST":"GET", headers:{Authorization:`Bearer ${data.session?.access_token || ""}`,"Content-Type":"application/json"},
    body:body?JSON.stringify(body):undefined,cache:"no-store",
  });
  const result = await response.json();
  if(!response.ok) throw new Error(result.error || "Unable to load publishing settings.");
  return result;
}
function Field({label,value,onChange,multiline=false}:{label:string;value:string;onChange:(value:string)=>void;multiline?:boolean}) {
  return <label className="block space-y-1 text-sm"><span>{label}</span>{multiline?<textarea className={inputStyle} rows={4} value={value} onChange={e=>onChange(e.target.value)} />:<input className={inputStyle} value={value} onChange={e=>onChange(e.target.value)}/>}</label>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}) {return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;}

export default function WebsitePublishing({organizationId,propertyId,onDirtyChange}:{organizationId:string;propertyId?:string;onDirtyChange?:(dirty:boolean)=>void}) {
  const [connection,setConnection] = useState<Connection>(emptyConnection);
  const [profile,setProfile] = useState<MarketingProfile>(normalizeProfile({}));
  const [facts,setFacts] = useState<PropertyFacts>(emptyFacts);
  const [listing,setListing] = useState<Listing|null>(null);
  const [jobs,setJobs] = useState<Job[]>([]);
  const [tab,setTab] = useState("Public Listing");
  const [preview,setPreview] = useState(false);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [loaded,setLoaded] = useState(false);
  const [hasChanges,setHasChanges] = useState(false);
  const [published,setPublished]=useState<PublicDTO|null>(null);
  const [publisherName,setPublisherName]=useState<string|null>(null);
  const [remote,setRemote]=useState<{remote_resource_id?:string;remote_url?:string;last_pushed_revision?:number;last_generation?:number;last_successful_sync?:string}|null>(null);
  function apply(data:{connection:Connection|null;listing?:Listing|null;facts?:PropertyFacts;jobs:Job[];publishedPayload?:{property:PublicDTO};remote?:typeof remote;publisherName?:string|null}) {
    setConnection(data.connection?{...data.connection,settings:normalizeSettings(data.connection.settings)}:emptyConnection);
    setJobs(data.jobs || []);
    if(propertyId) {setListing(data.listing || null);setProfile(normalizeProfile(data.listing?.profile));setFacts(data.facts || emptyFacts);setPublished(data.publishedPayload?.property||null);setRemote(data.remote||null);setPublisherName(data.publisherName||null);}
    setLoaded(true);
  }
  useEffect(()=>{
    let cancelled=false;
    api(organizationId,propertyId).then(data=>{if(!cancelled) apply(data);}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
    // The parent keys this editor by organization/property to isolate drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[organizationId,propertyId]);
  useEffect(()=>{
    if(!hasChanges) return;
    const protectDraft=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",protectDraft);
    return ()=>window.removeEventListener("beforeunload",protectDraft);
  },[hasChanges]);
  const dirty = ()=>{setHasChanges(true);setMessage("");onDirtyChange?.(true);};
  function change<K extends keyof MarketingProfile>(key:K,value:MarketingProfile[K]) {setProfile(p=>({...p,[key]:value}));dirty();}
  function changeConnection(next:Connection) {setConnection(next);dirty();}
  async function save(action="save") {
    setBusy(true);setError("");setMessage("");
    try {
      await api(organizationId,propertyId,propertyId?{organizationId,propertyId,revision:listing?.revision||0,profile,facts,action}:{organizationId,kind:"connection",connection});
      apply(await api(organizationId,propertyId));setHasChanges(false);onDirtyChange?.(false);
      setMessage(action==="publish"?"Public listing published. Synchronization work recorded.":action==="hide"?"Listing hidden from the public API.":"Changes saved.");
    } catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function sync(retry=false) {
    setBusy(true);setError("");
    try {if(retry)await api(organizationId,undefined,{organizationId,propertyId,kind:"retry"});await api(organizationId,undefined,{organizationId,kind:"sync"}); const data=await api(organizationId,propertyId);setJobs(data.jobs||[]);setRemote(data.remote||null);setMessage("Synchronization attempts recorded. See the results below.");}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function testConnection() {
    setBusy(true);setError("");
    try {const result=await api(organizationId,undefined,{organizationId,kind:"test"});setMessage(result.message);const data=await api(organizationId);setConnection(data.connection||emptyConnection);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const ready=readiness(profile,facts,connection.settings);
  const dto=serializePublicListing(profile,facts);
  const changes=publicationDiff(published,dto);
  const pendingJob=jobs.find(j=>["PENDING","RUNNING","FAILED","DEAD"].includes(j.status));
  const syncLabel=pendingJob?.status==="DEAD"?"Requires attention":pendingJob?.status==="FAILED"?"Retrying":pendingJob?"Pending":remote?.last_successful_sync?"Up to date":"Not synchronized";
  if(loading) return <p className="p-4 text-sm">Loading Website &amp; Publishing…</p>;
  return <section className="mt-5 space-y-4 rounded-[24px] border border-[#eadfce] bg-[#fcfaf7] p-5">
    <h3 className="text-lg font-semibold">{propertyId?"Website / Marketing":"Website & Publishing settings"}</h3>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="text-sm text-green-800">{message}</p>}
    {!loaded?<button className={buttonStyle} onClick={()=>{setLoading(true);api(organizationId,propertyId).then(apply).catch(e=>setError(e.message)).finally(()=>setLoading(false));}}>Retry loading</button>:<>
    {!propertyId?<>
      <p className="text-sm text-[#7f7263]">Connect your organization’s approved public listings. External website integrations will be added in a later phase.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Connection name" value={connection.name} onChange={name=>changeConnection({...connection,name})}/>
        <Field label="Website URL" value={connection.website_url} onChange={website_url=>changeConnection({...connection,website_url})}/>
        <label className="space-y-1 text-sm">Connection type<select className={inputStyle} value={connection.connector_type} onChange={e=>changeConnection({...connection,connector_type:e.target.value as ConnectorType})}>{CONNECTOR_TYPES.map(t=><option key={t} value={t}>{t==="GULERA_SITE"?"Gulera public API":`${t.replaceAll("_"," ")} (coming later)`}</option>)}</select></label>
        <div className="text-sm">Connection status: {connection.status||"NOT_CONNECTED"}</div>
        <label className="text-sm">Publishing mode<select className={inputStyle} value={connection.publishing_mode||"MANUAL_APPROVAL"} onChange={e=>changeConnection({...connection,publishing_mode:e.target.value as PublishingMode})}><option value="MANUAL_APPROVAL">Manual approval (recommended)</option><option value="AUTOMATIC">Automatic for already published properties</option></select></label>
        <label className="text-sm">Property connector adapter<select className={inputStyle} value={connection.configuration?.adapter||"GENERIC"} onChange={e=>changeConnection({...connection,configuration:{adapter:e.target.value as ConnectorConfiguration["adapter"],transport:"UNCONFIGURED"}})}><option value="GENERIC">Generic property feed</option><option value="STAYINNIAGARA">StayInNiagara (transport not configured)</option></select></label>
        <Toggle label="Enable public website access" value={connection.enabled} onChange={enabled=>changeConnection({...connection,enabled})}/>
        <Toggle label="Auto-sync approved publications when the worker is scheduled" value={connection.auto_update} onChange={auto_update=>changeConnection({...connection,auto_update})}/>
        <Toggle label="Require a public licence number" value={connection.settings.licenceRequired} onChange={licenceRequired=>changeConnection({...connection,settings:{...connection.settings,licenceRequired}})}/>
        <Toggle label="Require bedrooms and bathrooms" value={connection.settings.roomsRequired} onChange={roomsRequired=>changeConnection({...connection,settings:{...connection.settings,roomsRequired}})}/>
        <Field label="Recommended gallery photo count" value={String(connection.settings.minimumGallery)} onChange={value=>changeConnection({...connection,settings:{...connection.settings,minimumGallery:Number(value)}})}/>
        <label className="text-sm">Preferred booking provider<select className={inputStyle} value={connection.settings.preferredProvider} onChange={e=>changeConnection({...connection,settings:{...connection.settings,preferredProvider:e.target.value as typeof DEFAULT_SETTINGS.preferredProvider}})}>{["DIRECT","AIRBNB","VRBO","BOOKING_COM","OTHER"].map(p=><option key={p}>{p}</option>)}</select></label>
      </div>
      {connection.id&&<p className="break-all text-sm">Public feed: <a className="underline" href={`/api/public/v1/properties?site=${connection.id}`} target="_blank" rel="noreferrer">/api/public/v1/properties?site={connection.id}</a></p>}
      <button disabled={busy} className={buttonStyle} onClick={()=>void save()}>Save website settings</button>
      <button disabled={busy||hasChanges||!connection.id} className={`${buttonStyle} ml-2`} onClick={()=>void testConnection()}>Test website connection</button>
      <p className="text-sm text-[#7f7263]">{connection.publishing_mode==="AUTOMATIC"?"Ready changes to already published properties will be approved automatically. Initial publication and hidden listings still require an explicit Publish action.":"Changes remain private until a manager explicitly approves them."} Gulera manages property data only; your website owns branding, editorial content and layout.</p>
      {connection.last_successful_sync&&<p className="text-sm">Last successful sync: {connection.last_successful_sync}</p>}
      {connection.last_test_result&&<p className="text-sm">Last connection test: {connection.last_test_result.ok?"Available":"Not configured / unavailable"}</p>}
    </>:<>
      <div className="flex flex-wrap gap-4 text-sm"><strong>{listing?.state||"PRIVATE"}</strong><span>Website Readiness: {ready.score}% — {ready.ready?"Ready":"Needs information"}</span></div>
      <div className="flex flex-wrap gap-4 text-sm text-[#7f7263]"><span>Draft revision: {listing?.revision||0}{hasChanges?" + unsaved edits":""}</span><span>Approved revision: {listing?.published_revision??"Not yet published"}</span><span>Pending public changes: {published?changes.length:"Initial publication"}</span><span>Website sync: {syncLabel}</span>{remote?.last_pushed_revision!==undefined&&<span>Website revision: {remote.last_pushed_revision}</span>}</div>
      <progress className="w-full" max={100} value={ready.score} aria-label="Website readiness"/>
      {ready.missing.length>0&&<div className="text-sm"><strong>Missing requirements</strong><ul className="list-disc pl-5">{ready.missing.map(m=><li key={m}>{m}</li>)}</ul></div>}
      {ready.warnings.length>0&&<ul className="list-disc pl-5 text-sm text-[#7f7263]">{ready.warnings.map(w=><li key={w}>{w}</li>)}</ul>}
      <nav className="flex flex-wrap gap-2" aria-label="Marketing sections">{["Public Listing","Booking","Photos","Highlights","SEO","Publishing"].map(t=><button key={t} className={`${buttonStyle} ${t===tab?"border-[#b48d4e] bg-[#fff4df] font-semibold":""}`} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</nav>
      {tab==="Public Listing"&&<div className="grid gap-4 md:grid-cols-2">
        <Toggle label="Enable this public listing" value={profile.enabled} onChange={v=>change("enabled",v)}/>
        <Field label="Public property name" value={profile.name} onChange={v=>{change("name",v);if(!listing?.published_at&&(!profile.slug||profile.slug===slugify(profile.name)))change("slug",slugify(v));}}/>
        <Field label="URL slug (changing an established slug changes its URL)" value={profile.slug} onChange={v=>change("slug",v)}/>
        <Field label="Public location name" value={profile.location} onChange={v=>change("location",v)}/>
        <Field label="Tagline" value={profile.tagline} onChange={v=>change("tagline",v)}/>
        <Field label="Short card description" value={profile.cardDescription} onChange={v=>change("cardDescription",v)}/>
        <div className="md:col-span-2"><Field multiline label="Full public description" value={profile.description} onChange={v=>change("description",v)}/></div>
        <p className="md:col-span-2 text-sm text-[#7f7263]">Accommodation facts below are saved to the Gulera property and inherited by the website listing.</p>
        {(["property_type","bedrooms","bathrooms","max_guests","beds","parking_spaces"] as const).map(k=><Field key={k} label={k.replaceAll("_"," ")} value={String(facts[k]??"")} onChange={v=>{setFacts(f=>({...f,[k]:k==="property_type"?v:v===""?null:Number(v)}));dirty();}}/>)}
        <Field label="Public licence number" value={profile.licence} onChange={v=>change("licence",v)}/>
        <Field label="Parking details" value={profile.parking} onChange={v=>change("parking",v)}/>
        <Field label="Accessibility information" value={profile.accessibility} onChange={v=>change("accessibility",v)}/>
        <Toggle label="Show the property’s GPS coordinates publicly" value={profile.showCoordinates} onChange={v=>change("showCoordinates",v)}/>
      </div>}
      {tab==="Booking"&&<div className="space-y-4">
        {profile.channels.map((c,i)=><fieldset key={i} className="grid gap-3 rounded-xl border border-[#eadfce] p-3 md:grid-cols-2"><legend>Booking channel {i+1}</legend>
          <label className="text-sm">Provider<select className={inputStyle} value={c.provider} onChange={e=>change("channels",profile.channels.map((v,n)=>n===i?{...v,provider:e.target.value as typeof c.provider}:v))}>{["AIRBNB","VRBO","DIRECT","BOOKING_COM","OTHER"].map(p=><option key={p}>{p}</option>)}</select></label>
          <Field label="Booking URL" value={c.url} onChange={url=>change("channels",profile.channels.map((v,n)=>n===i?{...v,url}:v))}/>
          <Field label="Button label" value={c.label} onChange={label=>change("channels",profile.channels.map((v,n)=>n===i?{...v,label}:v))}/>
          <Field label="Priority (lower appears first)" value={String(c.priority)} onChange={v=>change("channels",profile.channels.map((c,n)=>n===i?{...c,priority:Number(v)}:c))}/>
          <Toggle label="Enabled" value={c.enabled} onChange={enabled=>change("channels",profile.channels.map((v,n)=>n===i?{...v,enabled}:v))}/>
          <Toggle label="Primary" value={c.primary} onChange={primary=>change("channels",profile.channels.map((v,n)=>({...v,primary:n===i?primary:false})))}/>
          <button className={buttonStyle} onClick={()=>change("channels",profile.channels.filter((_,n)=>n!==i))}>Remove channel</button>
        </fieldset>)}
        <button className={buttonStyle} onClick={()=>change("channels",[...profile.channels,{provider:connection.settings.preferredProvider,url:"",enabled:true,primary:profile.channels.length===0,priority:profile.channels.length,label:""}])}>Add booking channel</button>
      </div>}
      {tab==="Photos"&&<div className="space-y-4">
        <p className="text-sm">Enhance clarity, not reality. Use approved, permanent public HTTPS image URLs. Private operational photos are never imported automatically.</p>
        {profile.photos.map((p,i)=><fieldset key={i} className="grid gap-3 rounded-xl border border-[#eadfce] p-3 md:grid-cols-2"><legend>Photo {i+1}</legend>
          {(["originalUrl","publicUrl","caption","category","version"] as const).map(k=><Field key={k} label={{originalUrl:"Original image reference (private metadata)",publicUrl:"Approved public image URL",caption:"Public caption",category:"Room / category",version:"Public version metadata"}[k]} value={p[k]} onChange={v=>change("photos",profile.photos.map((p,n)=>n===i?{...p,[k]:v}:p))}/>)}
          <Field label="Display order" value={String(p.order)} onChange={v=>change("photos",profile.photos.map((p,n)=>n===i?{...p,order:Number(v)}:p))}/>
          <Toggle label="Approve for public display" value={p.approved} onChange={approved=>change("photos",profile.photos.map((p,n)=>n===i?{...p,approved,status:approved?"APPROVED":"ORIGINAL"}:p))}/>
          <Toggle label="Hero photo" value={p.hero} onChange={hero=>change("photos",profile.photos.map((p,n)=>({...p,hero:n===i?hero:false})))}/>
          <Toggle label="Include in gallery" value={p.gallery} onChange={gallery=>change("photos",profile.photos.map((p,n)=>n===i?{...p,gallery}:p))}/>
          <button className={buttonStyle} onClick={()=>change("photos",profile.photos.filter((_,n)=>n!==i))}>Remove photo</button>
        </fieldset>)}
        <button className={buttonStyle} onClick={()=>change("photos",[...profile.photos,{originalUrl:"",publicUrl:"",caption:"",category:"",version:"original",status:"ORIGINAL",approved:false,hero:false,gallery:true,order:profile.photos.length}])}>Add photo</button>
      </div>}
      {tab==="Highlights"&&<div className="grid gap-4 md:grid-cols-2">
        {FEATURE_KEYS.map(k=><label key={k} className="text-sm">{k.replace(/([A-Z])/g," $1")}<select className={inputStyle} value={profile.features[k]===null?"":String(profile.features[k])} onChange={e=>change("features",{...profile.features,[k]:e.target.value===""?null:e.target.value==="true"})}><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></select></label>)}
        {(["amenities","highlights","tags","seasonalTags"] as const).map(k=><Field key={k} multiline label={`${k} (one per line)`} value={profile[k].join("\n")} onChange={v=>change(k,v.split("\n"))}/>)}
        <Toggle label="Featured listing" value={profile.featured} onChange={v=>change("featured",v)}/>
        <Field label="Homepage priority" value={String(profile.homepagePriority)} onChange={v=>change("homepagePriority",Number(v))}/>
        <Field label="Featured order (optional, lower appears first)" value={profile.featuredPriority==null?"":String(profile.featuredPriority)} onChange={v=>change("featuredPriority",v===""?null:Number(v))}/>
      </div>}
      {tab==="SEO"&&<div className="space-y-4"><Field label="SEO page title" value={profile.seoTitle} onChange={v=>change("seoTitle",v)}/><Field label="SEO meta description" value={profile.seoDescription} onChange={v=>change("seoDescription",v)}/></div>}
      {tab==="Publishing"&&<div className="space-y-2 text-sm"><p>First published: {listing?.published_at||"Never"}</p><p>Last published: {listing?.last_published_at||"Never"}</p>{publisherName&&<p>Last publisher: {publisherName}</p>}<p>Last synchronization: {remote?.last_successful_sync||listing?.last_sync_at||"Not synchronized"}</p><p>{connection.publishing_mode==="AUTOMATIC"?"Ready saves approve changes automatically for published listings.":"Draft changes remain private until approved."} Hiding removes the listing from the public API immediately and queues a targeted unpublish.</p>{changes.length>0&&<ul className="list-disc pl-5">{changes.map((c,i)=><li key={i}>{c.summary}</li>)}</ul>}</div>}
      <div className="flex flex-wrap gap-2">
        <button className={buttonStyle} disabled={busy} onClick={()=>void save()}>{connection.publishing_mode==="AUTOMATIC"&&listing?.state==="PUBLISHED"?"Save (automatic approval when ready)":"Save draft changes"}</button>
        <button className={buttonStyle} onClick={()=>setPreview(v=>!v)}>{preview?"Close preview":"Preview public listing"}</button>
        <button className={buttonStyle} disabled={busy||!ready.ready||!profile.enabled||listing?.state==="PUBLISHED"} onClick={()=>void save("ready")}>Mark ready</button>
        <button className="rounded-xl bg-[#241c15] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy||!ready.ready||!profile.enabled} onClick={()=>{if(!preview){setPreview(true);setMessage("Review the draft preview, then select Approve & publish.");}else void save("publish");}}>{preview?"Approve & publish":listing?.published_at?"Review & publish changes":"Review & publish"}</button>
        {published&&<button className={buttonStyle} disabled={busy} onClick={()=>{if(window.confirm("Restore the last approved marketing copy? Shared operational property facts will stay as they are."))void save("revert");}}>Discard marketing draft</button>}
        <button className={buttonStyle} disabled={busy} onClick={()=>void save("hide")}>Hide / unpublish</button>
      </div>
      {preview&&<WebsitePublicationReview draft={dto} published={published} draftRevision={(listing?.revision||0)+1} publishedRevision={listing?.published_revision??null} siteId={connection.id} listingId={listing?.listing_id} generation={listing?.publication_generation||0} candidateGeneration={candidateGeneration(listing,profile,facts)} configurationRevision={connection.config_revision||1} onClose={()=>setPreview(false)}/>}
    </>}
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Synchronization status</summary><p className="my-2">Approved property updates are delivered independently of saving. The internal API connector is active; real external transports remain unconfigured.</p><button className={buttonStyle} disabled={busy} onClick={()=>void sync()}>Process due updates</button><button className={`${buttonStyle} ml-2`} disabled={busy} onClick={()=>void sync(true)}>Retry failed sync</button><ul className="mt-3 space-y-2">{jobs.map(j=><li key={j.id}>{j.operation}: {j.status} · {j.attempts} attempts{j.last_error?` — ${j.last_error}`:""}{j.status==="FAILED"&&j.next_retry_at?` · Next retry ${j.next_retry_at}`:""}</li>)}</ul></details>
    </>}
  </section>;
}
