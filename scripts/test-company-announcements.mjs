import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as model from "../lib/company-announcements.ts";
const exports={};
const code=ts.transpileModule(readFileSync(new URL("../lib/server/company-announcements.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modules={"server-only":{},"node:crypto":crypto,"../company-announcements":model,"./request-auth":{},"./organization-access":{}};
new Function("exports","require",code)(exports,k=>{assert.ok(k in modules,`Unexpected ${k}`);return modules[k];});
const org="11111111-1111-1111-1111-111111111111",other="22222222-2222-2222-2222-222222222222",admin="33333333-3333-3333-3333-333333333333",owner="44444444-4444-4444-4444-444444444444",cleaner="55555555-5555-5555-5555-555555555555",grounds="66666666-6666-6666-6666-666666666666",outsider="77777777-7777-7777-7777-777777777777";
const db=new PGlite();let groups=0;const pass=name=>{groups++;console.log(`PASS ${name}`);};
const draft={...model.ANNOUNCEMENT_TEMPLATES.ANNOUNCEMENT,message:"A company update.\n\n<script>alert('unsafe')</script>",audience:"ALL"};
const sender={email:"company@example.test",replyTo:"reply@example.test",name:"Company",origin:"https://gulera.example.test"};
async function role(name,query,params=[]) {return db.transaction(async tx=>{await tx.exec(`set local role ${name}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);return tx.query(query,params);});}
const save=async(p=draft,selected=null,tenant=org,actor=admin,id=null,revision=0)=>(await role("service_role","select save_company_announcement($1,$2,$3,$4,$5,$6) id",[tenant,actor,id,revision,p,selected])).rows[0].id;
const queue=async(id,revision=1)=>role("service_role","select queue_company_announcement($1,$2,$3,$4,$5)",[org,admin,id,revision,sender]);
const recipients=async id=>(await db.query("select * from company_announcement_recipients where announcement_id=$1 order by email",[id])).rows;
const sent=[],receipts=new Map();
async function mail(payload,key) {
  assert.equal(payload.to.length,1);assert.equal("cc" in payload,false);assert.equal("bcc" in payload,false);
  if(receipts.has(key)){assert.deepEqual(receipts.get(key).payload,payload);return receipts.get(key).id;}
  const id=crypto.randomUUID();receipts.set(key,{id,payload:structuredClone(payload)});sent.push(payload);return id;
}
const store={
  async claim(tenant,id,token){return (await role("service_role","select * from claim_company_announcement_emails($1,$2,$3)",[tenant,id,token])).rows;},
  async approved(job){const a=(await db.query("select * from company_announcements where id=$1 and organization_id=$2",[job.announcement_id,job.organization_id])).rows[0];assert.equal(a.status,"QUEUED");return {...model.normalizeAnnouncement({...a,linkUrl:a.link_url,linkLabel:a.link_label}),sender:a.sender};},
  async eligible(job){return !(await db.query("select * from company_announcement_preferences where organization_id=$1 and email=$2",[job.organization_id,job.email])).rows.length;},
  async finish(job,id){await role("service_role","select finish_company_announcement_email($1,$2,$3,$4)",[job.id,job.lease_token,id,id?null:"raw provider secret"]);},
};
const run=(id,send=mail)=>exports.processAnnouncements(store,org,id,send,async()=>{});
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table organizations(id uuid primary key,name text);create table profiles(id uuid primary key,role text,email text,full_name text);
    create table organization_members(organization_id uuid,profile_id uuid,role text);
    create table owner_accounts(id uuid primary key,organization_id uuid,full_name text,email text);
    create table cleaner_accounts(id uuid primary key,organization_id uuid,display_name text,email text);
    create table grounds_accounts(id uuid primary key,organization_id uuid,display_name text,email text);
    grant usage on schema public,auth to anon,authenticated,service_role;grant select on profiles,organization_members to authenticated;`);
  await db.exec(readFileSync(new URL("../supabase/add_audit_logs.sql",import.meta.url),"utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006030000_company_announcements.sql",import.meta.url),"utf8"));
  await db.query("insert into organizations values ($1,'Company'),($2,'Other')",[org,other]);
  await db.query("insert into profiles values ($1,'admin','admin@example.test','Manager'),($2,'platform_admin','platform@example.test','Platform')",[admin,outsider]);
  await db.query("insert into organization_members values ($1,$2,'admin')",[org,admin]);
  await db.query("insert into owner_accounts values ($1,$2,'Owner','owner@example.test'),($3,$4,'Other owner','private-other@example.test')",[owner,org,outsider,other]);
  await db.query("insert into cleaner_accounts values ($1,$2,'Cleaner','cleaner@example.test'),(gen_random_uuid(),$2,'Duplicate owner','OWNER@example.test'),(gen_random_uuid(),$2,'No email',''),(gen_random_uuid(),$2,'Comma attack','first@example.test,second@example.test')",[cleaner,org]);
  await db.query("insert into grounds_accounts values ($1,$2,'Grounds','grounds@example.test')",[grounds,org]);
  const all=await save();let rows=await recipients(all);assert.equal(rows.length,4);assert.equal(rows.some(r=>r.email.includes("private-other")),false);assert.equal(sent.length,0);pass("all-audience draft snapshots this tenant only, deduplicates roles, and excludes missing/invalid addresses without sending");
  for(const [audience,email] of [["OWNERS","owner@example.test"],["GROUNDS","grounds@example.test"],["ADMINS","admin@example.test"]]){const id=await save({...draft,audience});assert.deepEqual((await recipients(id)).map(r=>r.email),[email]);}
  const onlyCleaner=await save({...draft,audience:"CLEANERS"},[`CLEANERS:${cleaner}`]);assert.deepEqual((await recipients(onlyCleaner)).map(r=>r.email),["cleaner@example.test"]);
  await assert.rejects(()=>save({...draft,audience:"OWNERS"},[`CLEANERS:${cleaner}`]),/organization and audience/);
  await assert.rejects(()=>save(draft,[`OWNERS:${outsider}`]),/organization and audience/);pass("group broadcasts and individual selection respect both selected audience and organization boundaries");
  await assert.rejects(()=>save(draft,null,org,outsider),/Admin membership/);
  await assert.rejects(()=>role("anon","select * from company_announcements"),/permission denied/);
  await assert.rejects(()=>role("authenticated","select claim_company_announcement_emails($1,$2,$3)",[org,all,crypto.randomUUID()]),/permission denied/);
  await assert.rejects(()=>role("authenticated","select unsubscribe_token from company_announcement_recipients"),/permission denied/);
  assert.equal((await role("authenticated","select id from company_announcements where organization_id=$1",[other])).rows.length,0);
  await assert.rejects(()=>db.query("insert into company_announcement_recipients(announcement_id,organization_id,recipient_key,email) values ($1,$2,'fake','fake@example.test')",[all,other]),/foreign key/);pass("admin membership, RLS, secret token column permissions, worker grants and composite tenant FKs are enforced");
  await assert.rejects(()=>queue(all,7),/latest draft/);await queue(all);await queue(all);
  await assert.rejects(()=>save(draft,null,org,admin,all,1),/already queued/);
  await run(all);assert.equal(sent.length,4);assert.equal((await run(all)).processed,0);
  for(const payload of sent){assert.equal(payload.html.includes("<script>"),false);assert.ok(payload.html.includes("&lt;script&gt;"));for(const otherEmail of ["owner@example.test","cleaner@example.test","grounds@example.test","admin@example.test"].filter(e=>e!==payload.to[0]))assert.equal(payload.html.includes(otherEmail),false);assert.equal(payload.reply_to,"reply@example.test");}
  assert.ok((await recipients(all)).every(r=>r.status==="SENT"&&r.provider_id));pass("review revision guard, immutable send snapshots, repeat confirmation and one-to-one private delivery");
  const retry=await save({...draft,audience:"GROUNDS"});await queue(retry);
  await run(retry,async()=>{throw new Error("secret-token private contact");});let failed=(await recipients(retry))[0];assert.equal(failed.status,"FAILED");assert.equal(failed.last_error,"EMAIL_SEND_FAILED");assert.equal(JSON.stringify(failed).includes("secret-token"),false);assert.equal((await run(retry)).processed,0);
  await role("service_role","select retry_company_announcement($1,$2,$3)",[org,admin,retry]);await run(retry);assert.equal((await recipients(retry))[0].status,"SENT");pass("provider failure preserves campaign, redacts errors, backs off and retries the same individual identity");
  const uncertain=await save({...draft,audience:"GROUNDS"});await queue(uncertain);let lost=true;
  await assert.rejects(()=>exports.processAnnouncements({...store,async finish(job,id){if(lost){lost=false;throw new Error("database unavailable");}await store.finish(job,id);}},org,uncertain,mail,async()=>{}),/database unavailable/);
  const before=sent.length;const claimed=(await recipients(uncertain))[0];await db.query("update company_announcement_recipients set lease_until=now()-interval '1 second' where id=$1",[claimed.id]);await run(uncertain);assert.equal(sent.length,before);assert.equal((await recipients(uncertain))[0].status,"SENT");pass("lost receipts recover expired leases with unchanged provider idempotency key and payload");
  const old=await save({...draft,audience:"GROUNDS"});await queue(old);await run(old,async()=>{throw new Error();});await db.query("update company_announcement_recipients set first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 second' where announcement_id=$1",[old]);await run(old);assert.equal((await recipients(old))[0].status,"REVIEW");
  const exhausted=await save({...draft,audience:"GROUNDS"});await queue(exhausted);for(let n=0;n<5;n++){await db.query("update company_announcement_recipients set next_attempt_at=now()-interval '1 second' where announcement_id=$1",[exhausted]);await run(exhausted,async()=>{throw new Error();});}assert.equal((await recipients(exhausted))[0].status,"REVIEW");pass("uncertain old deliveries and maximum attempts are held for review instead of risking duplicate mail");
  const unsubscribe=(await recipients(all)).find(r=>r.email==="owner@example.test").unsubscribe_token;
  await role("service_role","select unsubscribe_company_announcements($1)",[unsubscribe]);const later=await save();assert.equal((await recipients(later)).some(r=>r.email==="owner@example.test"),false);
  const removed=await save({...draft,audience:"GROUNDS"});await queue(removed);await db.query("update grounds_accounts set email='new-address@example.test' where id=$1",[grounds]);await run(removed);assert.equal((await recipients(removed))[0].status,"SKIPPED");pass("opt-outs suppress future broadcasts across roles and changed/deleted accounts are skipped before delivery");
  const plain=model.normalizeAnnouncement({...draft,message:"Plain message",linkUrl:"",linkLabel:"ignored"});const plainEmail=model.individualAnnouncementEmail(plain,{email:"one@example.test",name:""},sender,"https://gulera.example.test/preferences");assert.equal(plain.linkLabel,"");assert.equal(plainEmail.html.includes("<p></p>"),false);assert.equal(model.singleEmail("a@example.test\r\nBcc: b@example.test"),"");
  for(const input of [{...draft,subject:"Hello\r\nBcc: other@example.test"},{...draft,linkUrl:"javascript:alert(1)"},{...draft,kind:"SURVEY",linkUrl:""}])assert.throws(()=>model.normalizeAnnouncement(input));
  const survey=model.normalizeAnnouncement({...model.ANNOUNCEMENT_TEMPLATES.SURVEY,linkUrl:"https://forms.example.test/survey?campaign=1"});assert.equal(survey.linkLabel,"Complete the survey");pass("plain-text escaping, safe links, survey requirements, header injection guards and optional-link collapse");
  let signedIn=false,allowedOrg=org,rpcCalls=0;
  modules["./request-auth"].authenticateBearerRequest=async()=>signedIn?{ok:true,user:{id:admin}}:{ok:false,status:401,error:"Authentication required."};
  modules["./organization-access"].requireOrganizationAdmin=async()=>({id:admin,role:"admin"});
  modules["./request-auth"].createServiceRoleClient=()=>({from(table){assert.equal(table,"organization_members");const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:filters.organization_id===allowedOrg?{profile_id:admin}:null,error:null};}};},async rpc(){rpcCalls++;throw new Error("Unexpected RPC");}});
  const request=body=>new Request("https://gulera.example.test/api/admin/company-announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await exports.postAnnouncement(request({organizationId:org,action:"send",id:all,confirm:true,revision:1}))).status,401);
  signedIn=true;
  assert.equal((await exports.postAnnouncement(request({organizationId:other,action:"send",id:all,confirm:true,revision:1}))).status,403);
  assert.equal((await exports.postAnnouncement(request({organizationId:org,action:"send",id:all,revision:1}))).status,400);
  assert.equal((await exports.postAnnouncement(request({organizationId:org,action:"save",audience:"ALL",draft,recipientKeys:[42],revision:0}))).status,400);
  assert.equal((await exports.postAnnouncement(request(null))).status,400);assert.equal(rpcCalls,0);
  pass("actual admin handler blocks anonymous/cross-tenant sends, missing confirmation and forged recipient inputs before queueing");
  assert.ok((await db.query("select * from audit_logs where action_type='owner_announcement_queued'")).rows.length===0);
  assert.ok((await db.query("select * from audit_logs where action_type='company_announcement_queued'")).rows.length>0);
  if(process.argv.includes("--communications")) {
    const {testCommunicationsCenter}=await import("./test-communications-center.mjs");
    await testCommunicationsCenter({db,role,save,queue,recipients,mail,store,exports,org,other,admin,owner,cleaner,grounds,outsider,draft,sender,sent,receipts,modules});
  } else {
    await db.exec(readFileSync(new URL("../supabase/rollback_company_announcements.sql",import.meta.url),"utf8"));assert.equal((await db.query("select * from owner_accounts where id=$1",[owner])).rows.length,1);pass("migration rollback preserves existing accounts and audit history");
  }
  console.log(`${groups} company announcement groups passed (disposable PostgreSQL and fake mail only).`);
}finally{await db.close();}
