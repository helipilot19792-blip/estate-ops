import "server-only";
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ANNOUNCEMENT_AUDIENCES,TEMPLATE_CATEGORIES,normalizeAnnouncement,singleEmail,individualAnnouncementEmail,type AnnouncementDraft} from "../company-announcements";
import {authenticateBearerRequest,createServiceRoleClient} from "./request-auth";
import {requireOrganizationAdmin} from "./organization-access";
const headers={"Cache-Control":"private, no-store"};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message:string,code="22023")=>Object.assign(new Error(message),{code});
const CAMPAIGN_COLUMNS="id,organization_id,kind,audience,subject,message,link_url,link_label,status,revision,created_at,queued_at,category,channel,scheduled_at,schedule_timezone,confirmed_at,started_at,completed_at,selection_keys,exclusion_summary,created_by,updated_by";
const RECIPIENT_COLUMNS="id,recipient_key,email,full_name,status,attempts,next_attempt_at,last_error,sent_at,recipient_role,last_attempted_at,retry_succeeded_at";
export function requireAnnouncementEmailEnabled(){if(process.env.COMPANY_ANNOUNCEMENTS_EMAIL_ENABLED!=="true")throw fail("Live announcement email is disabled. Enable it only after production approval.","CONFIGURATION");}
export async function requireAnnouncementAdmin(service:SupabaseClient,actor:string,org:string) {
  await requireOrganizationAdmin(service,actor,org);
  const {data,error}=await service.from("organization_members").select("profile_id").eq("organization_id",org).eq("profile_id",actor).eq("role","admin").maybeSingle();
  if(error)throw error;if(!data)throw fail("Admin membership in this organization is required.","FORBIDDEN");
}
async function access(request:Request,org:unknown) {
  const auth=await authenticateBearerRequest(request);if(!auth.ok)throw fail(auth.error,"UNAUTHORIZED");
  if(typeof org!=="string"||!uuid.test(org))throw fail("Choose an organization.");
  const service=createServiceRoleClient();await requireAnnouncementAdmin(service,auth.user.id,org);return {service,actor:auth.user.id,adminEmail:singleEmail(auth.user.email),org};
}
async function senderConfiguration(service:SupabaseClient,org:string) {
  const [a,b]=await Promise.all([
    service.from("organization_invoice_settings").select("company_name,from_email,reply_to_email").eq("organization_id",org).maybeSingle(),
    service.from("organizations").select("name").eq("id",org).single(),
  ]);
  if(a.error||b.error)throw fail("Could not load company email settings.","CONFIGURATION");
  const email=singleEmail(a.data?.from_email||process.env.INVITE_FROM_EMAIL),replyTo=singleEmail(a.data?.reply_to_email||email);
  const base=process.env.NEXT_PUBLIC_APP_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:"");
  let origin="";try{const u=new URL(base);if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash)throw new Error();origin=u.origin;}catch{throw fail("Configure NEXT_PUBLIC_APP_URL with Gulera’s HTTPS address before sending.","CONFIGURATION");}
  if(!process.env.RESEND_API_KEY||!email||!replyTo)throw fail("Configure the company sender, reply-to address, and email service before sending.","CONFIGURATION");
  return {email,replyTo,name:String(a.data?.company_name||b.data?.name||""),origin};
}
export type AnnouncementJob={id:string;announcement_id:string;organization_id:string;recipient_key:string;email:string;full_name:string;recipient_role?:string;unsubscribe_token:string;lease_token:string};
export type ApprovedAnnouncement=AnnouncementDraft&{sender:{email:string;replyTo:string;name:string;origin:string}};
export interface AnnouncementStore {
  claim(org:string|null,id:string|null,token:string):Promise<AnnouncementJob[]>;
  approved(job:AnnouncementJob):Promise<ApprovedAnnouncement>;
  eligible(job:AnnouncementJob):Promise<boolean>;
  eligibility?(job:AnnouncementJob):Promise<string|null>;
  finish(job:AnnouncementJob,providerId:string|null,error?:string):Promise<void>;
}
export function announcementStore(service:SupabaseClient):AnnouncementStore {
  return {
    async claim(org,id,token){const r=await service.rpc("claim_company_announcement_emails",{p_org:org,p_id:id,p_token:token});if(r.error)throw r.error;return r.data||[];},
    async approved(job){const r=await service.from("company_announcements").select("kind,subject,message,link_url,link_label,sender,status").eq("organization_id",job.organization_id).eq("id",job.announcement_id).single();if(r.error||!["QUEUED","SENDING"].includes(r.data?.status))throw fail("Campaign unavailable.");return {...normalizeAnnouncement({...r.data,linkUrl:r.data.link_url,linkLabel:r.data.link_label}),sender:r.data.sender};},
    async eligible(job){const r=await service.from("company_announcement_preferences").select("email").eq("organization_id",job.organization_id).eq("email",job.email).maybeSingle();if(r.error)throw r.error;return !r.data;},
    async eligibility(job){const r=await service.rpc("company_announcement_delivery_check",{p_org:job.organization_id,p_id:job.id,p_token:job.lease_token});if(r.error)throw r.error;return r.data;},
    async finish(job,providerId,error){const r=await service.rpc("finish_company_announcement_email",{p_id:job.id,p_token:job.lease_token,p_provider_id:providerId,p_error:providerId?null:error||"EMAIL_SEND_FAILED"});if(r.error)throw r.error;},
  };
}
export async function sendIndividualAnnouncement(payload:ReturnType<typeof individualAnnouncementEmail>,key:string):Promise<string> {
  requireAnnouncementEmailEnabled();
  if(payload.to.length!==1||!singleEmail(payload.to[0]))throw fail("One recipient is required.");
  // Direct bounded request avoids logging raw provider errors (which may contain contact data).
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000),redirect:"error"});
  if(!r.ok)throw fail("Email provider did not accept the message.");
  const result=await r.json();if(typeof result.id!=="string"||!result.id)throw fail("Missing email receipt.");return result.id;
}
export async function processAnnouncements(store:AnnouncementStore,org:string|null,id:string|null,send=sendIndividualAnnouncement,pause=()=>new Promise<void>(resolve=>setTimeout(resolve,600))) {
  if(send===sendIndividualAnnouncement)requireAnnouncementEmailEnabled();
  const jobs=await store.claim(org,id,randomUUID());let accepted=0,failed=0;
  for(const job of jobs) {
    let providerId:string|null=null,error="EMAIL_SEND_FAILED";
    try {
      if(org&&job.organization_id!==org)throw fail("Tenant boundary.");
      const a=await store.approved(job);
      const unavailable=store.eligibility?await store.eligibility(job):!await store.eligible(job)?"OPTED_OUT":null;
      if(unavailable){error=unavailable;throw fail("Recipient unavailable.");}
      const unsubscribe=`${a.sender.origin}/announcement-preferences?token=${job.unsubscribe_token}`;
      const roles:Record<string,string>={OWNERS:"Owner",CLEANERS:"Cleaner",GROUNDS:"Grounds staff",ADMINS:"Admin"};
      const payload=individualAnnouncementEmail(a,{email:job.email,name:job.full_name,role:roles[job.recipient_role||""]},a.sender,unsubscribe);
      providerId=await send(payload,`company-announcement/${job.id}`);accepted++;
    }catch{failed++;}
    await store.finish(job,providerId,error);
    await pause();
  }
  return {processed:jobs.length,accepted,failed};
}
/** No campaign or audience records are touched; the destination comes from authenticated identity. */
export async function sendAnnouncementTest(service:SupabaseClient,org:string,actor:string,email:string,draft:AnnouncementDraft,requestId:string,sender:ApprovedAnnouncement["sender"],send=sendIndividualAnnouncement) {
  draft=normalizeAnnouncement(draft);
  if(!singleEmail(email)||!uuid.test(requestId))throw fail("A verified admin email and test identity are required.");
  const p=await service.from("profiles").select("full_name").eq("id",actor).maybeSingle();if(p.error)throw p.error;
  const payload=individualAnnouncementEmail({...draft,subject:`[TEST] ${draft.subject}`},{email,name:p.data?.full_name||"",role:"Admin"},sender,`${sender.origin}/announcement-preferences?test=1`);
  const token=randomUUID(),r=await service.rpc("reserve_company_announcement_test",{p_org:org,p_actor:actor,p_request:requestId,p_payload:payload,p_token:token});if(r.error)throw r.error;
  if(r.data.status==="SENT")return {tested:true};
  let provider:string|null=null;try{provider=await send(r.data.payload,`company-test/${r.data.id}`);}catch{/* Store only a generic failure, never provider credentials or contact data. */}
  const finished=await service.rpc("finish_company_announcement_test",{p_id:r.data.id,p_token:token,p_provider:provider});if(finished.error)throw finished.error;
  if(!provider)throw fail("Test email was not accepted. You may retry the unchanged test.","CONFIGURATION");return {tested:true};
}
function responseError(error:unknown) {
  const e=error as {code?:string;message?:string};
  const status=e.code==="UNAUTHORIZED"?401:["FORBIDDEN","42501"].includes(e.code||"")?403:e.code==="P0002"?404:e.code==="40001"?409:["22023","CONFIGURATION"].includes(e.code||"")?400:500;
  return Response.json({error:status===500?"Could not complete the announcement action.":e.message},{status,headers});
}
export async function getAnnouncements(request:Request) {
  try {
    const search=new URL(request.url).searchParams,{service,org}=await access(request,search.get("organizationId"));
    const id=search.get("id");if(id&&!uuid.test(id))throw fail("Invalid announcement.");
    if(id) {
      const [a,b]=await Promise.all([service.from("company_announcements").select(CAMPAIGN_COLUMNS).eq("organization_id",org).eq("id",id).single(),service.from("company_announcement_recipients").select(RECIPIENT_COLUMNS).eq("organization_id",org).eq("announcement_id",id).order("email").range(0,999)]);
      if(a.error||b.error)throw fail("Announcement not found.","P0002");
      const counts=await service.rpc("company_announcement_status",{p_org:org,p_id:id});if(counts.error)throw counts.error;
      const review=await service.rpc("company_announcement_review",{p_org:org,p_id:id});if(review.error)throw review.error;
      const orgRow=await service.from("organizations").select("name").eq("id",org).single();
      return Response.json({announcement:a.data,recipients:b.data,counts:counts.data,review:review.data,companyName:orgRow.data?.name||""},{headers});
    }
    const filters=Object.fromEntries(["q","status","audience","category","kind","from","to","sender","recipient"].map(k=>[k,(search.get(k)||"").slice(0,200)]));
    for(const k of ["from","to"])if(filters[k]&&!/^\d{4}-\d{2}-\d{2}$/.test(filters[k]))throw fail("Use valid date filters.");
    const offset=Number(search.get("offset")||0);if(!Number.isInteger(offset)||offset<0||offset>1000000)throw fail("Invalid history offset.");
    const [a,b,c,templates,organization]=await Promise.all([service.rpc("company_announcement_contacts",{p_org:org}).order("full_name").range(0,999),service.rpc("company_announcement_history",{p_org:org,p_filters:filters,p_limit:50,p_offset:offset}),service.from("company_announcement_preferences").select("email").eq("organization_id",org),service.from("company_announcement_templates").select("id,name,kind,subject,message,link_url,link_label,category,revision,created_by,updated_by,created_at,updated_at").eq("organization_id",org).is("archived_at",null).order("name").limit(100),service.from("organizations").select("*").eq("id",org).single()]);
    if(a.error||b.error||c.error)throw a.error||b.error||c.error;
    if(templates.error||organization.error)throw templates.error||organization.error;
    let timezone=organization.data?.timezone||organization.data?.time_zone||"America/Toronto";try{new Intl.DateTimeFormat("en",{timeZone:timezone});}catch{timezone="America/Toronto";}
    return Response.json({contacts:a.data,announcements:b.data,optedOut:(c.data||[]).map(p=>p.email),templates:templates.data,timezone,companyName:organization.data?.name||"",emailEnabled:process.env.COMPANY_ANNOUNCEMENTS_EMAIL_ENABLED==="true",contactLimit:1000,historyOffset:offset,historyHasMore:(b.data||[]).length===50},{headers});
  }catch(e){return responseError(e);}
}
export async function postAnnouncement(request:Request) {
  try {
    const raw=await request.text();if(raw.length>100000)throw fail("Announcement request is too large.");
    let p;try{p=JSON.parse(raw);}catch{throw fail("Send valid announcement details.");}
    if(!p||typeof p!=="object"||Array.isArray(p))throw fail("Send valid announcement details.");
    const {service,actor,org,adminEmail}=await access(request,p.organizationId);
    const id=p.id;if(id&&!uuid.test(id))throw fail("Invalid announcement.");
    if(p.action==="save") {
      let draft;try{draft=normalizeAnnouncement(p.draft,true);}catch(e){throw fail((e as Error).message);}
      if(!TEMPLATE_CATEGORIES.includes(p.category||"GENERAL"))throw fail("Choose a template category.");
      if(!ANNOUNCEMENT_AUDIENCES.includes(p.audience))throw fail("Choose an audience.");
      if(p.recipientKeys!==null&&(!Array.isArray(p.recipientKeys)||p.recipientKeys.length>1000||p.recipientKeys.some((v:unknown)=>typeof v!=="string")))throw fail("Choose valid recipients.");
      if(!Number.isInteger(p.revision)||p.revision<0)throw fail("Invalid draft revision.");
      const r=await service.rpc("save_company_announcement",{p_org:org,p_actor:actor,p_id:id||null,p_revision:p.revision,p_draft:{...draft,audience:p.audience,category:p.category||"GENERAL"},p_recipient_keys:p.recipientKeys});if(r.error)throw r.error;return Response.json({id:r.data},{headers});
    }
    if(p.action==="test") {requireAnnouncementEmailEnabled();let draft;try{draft=normalizeAnnouncement(p.draft);}catch(e){throw fail((e as Error).message);}return Response.json(await sendAnnouncementTest(service,org,actor,adminEmail,draft,p.requestId,await senderConfiguration(service,org)),{headers});}
    if(p.action==="template") {
      if(!["save","duplicate","archive"].includes(p.operation)||!Number.isInteger(p.revision))throw fail("Choose a valid template action.");
      if(p.operation!=="save"&&!id)throw fail("Choose a saved template.");
      let template={};if(p.operation==="save"){let copy;try{copy=normalizeAnnouncement(p.draft,true);}catch(e){throw fail((e as Error).message);}if(typeof p.name!=="string"||!p.name.trim()||p.name.trim().length>150||!TEMPLATE_CATEGORIES.includes(p.category))throw fail("Choose a template name and category.");template={...copy,name:p.name.trim(),category:p.category};}
      const r=await service.rpc("manage_company_announcement_template",{p_org:org,p_actor:actor,p_id:id||null,p_revision:p.revision,p_action:p.operation,p_template:template});if(r.error)throw r.error;return Response.json({id:r.data},{headers});
    }
    if(!id)throw fail("Save and review the draft first.");
    if(p.action==="duplicate"){const r=await service.rpc("duplicate_company_announcement",{p_org:org,p_actor:actor,p_id:id});if(r.error)throw r.error;return Response.json({id:r.data},{headers});}
    if(p.action==="cancel"||p.action==="editSchedule"){const r=await service.rpc("change_company_announcement_schedule",{p_org:org,p_actor:actor,p_id:id,p_revision:p.revision,p_action:p.action==="cancel"?"cancel":"edit"});if(r.error)throw r.error;return Response.json({ok:true},{headers});}
    if(p.action==="send"||p.action==="schedule") {
      if(p.confirm!==true||!Number.isInteger(p.revision))throw fail("Review and confirm the recipients before sending.");
      const sender=await senderConfiguration(service,org);
      const current=await service.from("company_announcements").select("kind,subject,message,link_url,link_label").eq("id",id).eq("organization_id",org).single();if(current.error)throw fail("Announcement not found.","P0002");try{normalizeAnnouncement({...current.data,linkUrl:current.data.link_url,linkLabel:current.data.link_label});}catch(e){throw fail((e as Error).message);}
      if(p.action==="send")requireAnnouncementEmailEnabled();
      if(p.action==="schedule"&&(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(p.scheduledAt||"")||!Number.isFinite(Date.parse(p.scheduledAt))))throw fail("Use a timezone-aware scheduled timestamp.");
      const r=await service.rpc("confirm_company_announcement",{p_org:org,p_actor:actor,p_id:id,p_revision:p.revision,p_sender:sender,p_scheduled:p.action==="schedule"?p.scheduledAt:null,p_zone:p.timezone||"America/Toronto"});if(r.error)throw r.error;
      // Queue is durable; processing is a separate explicit request, after this confirmation commits.
      return Response.json({queued:true},{headers});
    }
    if(p.action==="retry") {const r=await service.rpc("retry_company_announcement",{p_org:org,p_actor:actor,p_id:id});if(r.error)throw r.error;}
    else if(p.action!=="process")throw fail("Unsupported action.");
    if(!process.env.RESEND_API_KEY)throw fail("Email service is not configured.","CONFIGURATION");
    return Response.json(await processAnnouncements(announcementStore(service),org,id),{headers});
  }catch(e){return responseError(e);}
}
