import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {PGlite} from "@electric-sql/pglite";
import * as crypto from "node:crypto";
import * as https from "node:https";
import * as dns from "node:dns/promises";
import * as net from "node:net";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import * as domain from "../lib/website-publishing.ts";
import {mockStayInNiagara} from "./fixtures/mock-stayinniagara.mjs";
function load(path,modules) {
  const exports={};const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("exports","require",code)(exports,name=>{assert.ok(name in modules,`Unexpected ${name}`);return modules[name];});return exports;
}
const publication=load("../lib/website-publication.ts",{"./website-publishing":domain});
const connector=load("../lib/website-property-connector.ts",{"./website-publishing":domain});
const worker=load("../lib/server/website-sync-worker.ts",{"server-only":{},"node:crypto":crypto,"../website-publishing":domain,"../website-property-connector":connector});
const security=load("../lib/server/website-transport-security.ts",{"server-only":{},"node:dns/promises":dns,"node:net":net,"node:https":https});
const Content=load("../components/public/listing-content.tsx",{"react/jsx-runtime":await import("react/jsx-runtime")}).default;
const org="11111111-1111-1111-1111-111111111111",other="22222222-2222-2222-2222-222222222222",property="33333333-3333-3333-3333-333333333333",otherProperty="44444444-4444-4444-4444-444444444444",actor="55555555-5555-5555-5555-555555555555";
const db=new PGlite();let groups=0;
const pass=name=>{groups++;console.log(`PASS ${name}`);};
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table organizations(id uuid primary key);create table profiles(id uuid primary key,role text,email text);
    create table organization_members(organization_id uuid,profile_id uuid,role text);
    create table properties(id uuid primary key,organization_id uuid not null references organizations(id),name text,notes text,latitude numeric,longitude numeric);
    grant usage on schema public,auth to authenticated,anon,service_role;grant select on profiles,organization_members to authenticated;grant all on properties to service_role;`);
  await db.exec(readFileSync(new URL("../supabase/add_audit_logs.sql",import.meta.url),"utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006010000_website_publishing.sql",import.meta.url),"utf8"));
  await db.query("insert into organizations values ($1),($2)",[org,other]);
  await db.query("insert into profiles(id,role) values ($1,'admin')",[actor]);
  await db.query("insert into organization_members values ($1,$2,'admin')",[org,actor]);
  await db.query("insert into properties(id,organization_id,name,notes) values ($1,$2,'A','Private operational note'),($3,$4,'B','Other private note')",[property,org,otherProperty,other]);
  const profile=domain.normalizeProfile({enabled:true,name:"Quarry Hideaway",slug:"quarry-hideaway",location:"Niágara",description:"Approved retreat",featured:true,featuredPriority:2,
    channels:[{provider:"AIRBNB",url:"https://book.example.test/a",enabled:true,primary:true}],photos:[{originalUrl:"private://secret",publicUrl:"https://images.example.test/hero.jpg",approved:true,hero:true,status:"APPROVED"}]});
  const facts={property_type:"Cottage",bedrooms:2,bathrooms:1,max_guests:6,beds:null,parking_spaces:null};
  const cfg={name:"StayInNiagara mock",website_url:"",connector_type:"CUSTOM_API",enabled:true,auto_update:true,status:"UNSUPPORTED",settings:domain.DEFAULT_SETTINGS,configuration:{adapter:"STAYINNIAGARA",transport:"UNCONFIGURED"},publishing_mode:"MANUAL_APPROVAL"};
  async function role(name,sql,params=[]) {return db.transaction(async tx=>{await tx.exec(`set local role ${name}`);await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);return tx.query(sql,params);});}
  const factRow=async id=>(await db.query("select to_jsonb(p) as facts from properties p where id=$1",[id])).rows[0].facts;
  const current=async id=>(await db.query("select to_jsonb(l) as l from property_public_listings l where property_id=$1",[id])).rows[0]?.l;
  const connection=async tenant=>(await db.query("select to_jsonb(c) as c from website_connections c where organization_id=$1",[tenant])).rows[0]?.c;
  async function save(copy=profile,action="save",id=property,tenant=org,newFacts=facts) {
    const p=await factRow(id),c=await connection(tenant),l=await current(id);
    const expected=Object.fromEntries(domain.FACT_COLUMNS.split(",").map(k=>[k,p[k]]));
    const state=action==="revert"?(l?.state||"PRIVATE"):domain.transition(l?.state||"PRIVATE",action,copy,{...expected,...newFacts},c?.settings||domain.DEFAULT_SETTINGS);
    await role("service_role","select save_website_listing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[tenant,id,actor,l?.revision||0,expected,c?.settings||null,newFacts,copy,state,action]);
  }
  // Seed an existing approval before upgrade: migration must freeze it without approving its draft.
  await role("service_role","select save_website_connection($1,$2,$3)",[org,actor,cfg]);
  await save(profile,"publish");
  await save({...profile,description:"Pre-migration draft"});
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006020000_website_approval_worker.sql",import.meta.url),"utf8"));
  let l=await current(property);assert.equal(l.published_facts.max_guests,6);assert.equal(l.published_profile.description,"Approved retreat");assert.equal(l.profile.description,"Pre-migration draft");assert.equal(l.published_revision,1);assert.equal(l.published_by,actor);assert.equal((await connection(org)).publishing_mode,"MANUAL_APPROVAL");pass("upgrade freezes existing approval and defaults to manual mode");
  assert.equal(l.published_location,domain.slugify(profile.location));
  const remote=mockStayInNiagara(),editorial=structuredClone(remote.editorial);
  const store={
    async claim(tenant,token,manual){return (await role("service_role","select * from claim_website_jobs($1,5,$2,$3)",[tenant,token,manual])).rows;},
    async current(job){return {listing:await current(job.property_id),connection:await connection(job.organization_id)};},
    async finish(job,ok,error,result,publisher){await role("service_role","select finish_website_job($1,$2,$3,$4,$5,$6,$7)",[job.id,job.lease_token,ok,error,result.remoteId||null,result.remoteUrl||null,publisher]);},
  };
  const run=()=>worker.runWebsiteWorker(store,{org,manual:true,actor,connector:c=>connector.createPropertyConnector(connector.normalizeConnectorConfiguration(c.configuration),remote.transport)});
  await run();assert.equal(remote.properties.size,1);const key=[...remote.properties.keys()][0];assert.equal(remote.properties.get(key).property.description,"Approved retreat");pass("mock publishes approved snapshot to one stable resource");
  await save({...profile,description:"New draft",channels:[{...profile.channels[0],url:"https://book.example.test/b"}]},"save",property,org,{...facts,max_guests:8});
  await run();assert.equal(remote.properties.get(key).property.description,"Approved retreat");assert.equal(remote.properties.get(key).property.maxGuests,6);
  l=await current(property);const currentFacts=await factRow(property);const draftPayload=publication.publicationPayload(l.profile,Object.fromEntries(domain.FACT_COLUMNS.split(",").map(k=>[k,currentFacts[k]])),l.revision);
  assert.equal(draftPayload.property.description,"New draft");assert.equal(draftPayload.property.maxGuests,8);assert.equal(JSON.stringify(draftPayload).includes("Private operational"),false);assert.equal(JSON.stringify(draftPayload).includes("private://"),false);
  const diff=publication.publicationDiff(domain.serializePublicListing(l.published_profile,l.published_facts),draftPayload.property);assert.ok(diff.some(d=>d.summary==="Maximum guests: 6 → 8"));assert.ok(diff.some(d=>d.label==="Booking destinations"));
  assert.equal(remote.properties.get(key).property.bookingChannels[0].url,profile.channels[0].url);pass("manual drafts, factual edits and sanitized preview do not mutate remote approval; human diff identifies changes");
  await save({...l.profile,enabled:false},"save",property,org,{...facts,max_guests:8});
  assert.equal((await current(property)).state,"PUBLISHED");await run();assert.equal(remote.properties.get(key).property.description,"Approved retreat");
  await save(l.profile,"save",property,org,{...facts,max_guests:8});
  pass("disabling a manual working draft does not implicitly unpublish the approved resource");
  await save(l.profile,"publish",property,org,{...facts,max_guests:8});await run();assert.equal(remote.properties.size,1);assert.equal(remote.properties.get(key).property.description,"New draft");assert.equal(remote.properties.get(key).property.maxGuests,8);
  const approved=structuredClone(remote.properties.get(key));await remote.transport.upsertProperty(approved);assert.equal(remote.properties.size,1);
  const generation=(await current(property)).publication_generation;await save(l.profile,"publish",property,org,{...facts,max_guests:8});assert.equal((await current(property)).publication_generation,generation);pass("approval updates the same resource; duplicate delivery and repeated approval are idempotent");
  // Several approvals before delivery: older jobs remain history but are superseded.
  for(const description of ["Intermediate A","Intermediate B","Latest approved"])await save({...profile,description},"publish");
  const callsBefore=remote.calls.length;await run();assert.equal(remote.calls.length,callsBefore+1);assert.equal(remote.properties.get(key).property.description,"Latest approved");
  assert.ok((await db.query("select count(*)::integer n from website_sync_jobs where status='SUPERSEDED'")).rows[0].n>=2);pass("coalescing delivers only the latest approval while retaining obsolete job history");
  await save({...profile,description:"Restore marketing"});await save(profile,"revert");assert.equal((await current(property)).profile.description,"Latest approved");assert.equal((await factRow(property)).max_guests,6);pass("discard restores approved marketing without rolling back canonical property facts");
  await role("service_role","select save_website_connection($1,$2,$3)",[org,actor,{...cfg,publishing_mode:"AUTOMATIC"}]);
  await save({...profile,description:"Automatically approved"});l=await current(property);assert.equal(l.published_profile.description,"Automatically approved");assert.equal(l.published_revision,l.revision);
  await db.query("update properties set parking_spaces=0 where id=$1",[property]);assert.equal((await current(property)).published_facts.parking_spaces,0);await run();assert.equal(remote.properties.get(key).property.parkingSpaces,0);pass("automatic mode approves eligible edits and canonical facts atomically");
  // Invalid automatic drafts leave the valid publication untouched.
  await save({...profile,description:""});assert.equal((await current(property)).published_profile.description,"Automatically approved");
  await save({...profile,description:"Recovered"});remote.setAvailable(false);await run();
  let failed=(await db.query("select * from website_sync_jobs where status='FAILED' order by sequence desc limit 1")).rows[0];assert.equal(failed.attempts,1);assert.ok(new Date(failed.next_retry_at)>new Date());assert.equal(failed.last_error,"CONNECTOR_DELIVERY_FAILED");assert.equal(JSON.stringify(failed).includes("secret-token"),false);assert.equal((await current(property)).state,"PUBLISHED");
  assert.equal((await run()).processed,0,"backoff is respected");
  remote.setAvailable(true);await db.query("update website_sync_jobs set next_retry_at=now()-interval '1 second' where id=$1",[failed.id]);await run();assert.equal(remote.properties.get(key).property.description,"Recovered");pass("failure preserves Gulera, redacts secrets, respects backoff and recovers with the same identity");
  await save({...profile,description:"Dead letter"});remote.setAvailable(false);
  for(let n=0;n<5;n++){await db.exec("update website_sync_jobs set next_retry_at=now()-interval '1 second' where status in ('PENDING','FAILED')");await run();}
  const dead=(await db.query("select * from website_sync_jobs where status='DEAD'")).rows[0];assert.equal(dead.attempts,5);
  await role("service_role","select retry_website_jobs($1,$2,$3)",[org,property,actor]);remote.setAvailable(true);await run();assert.equal(remote.properties.get(key).property.description,"Dead letter");pass("maximum attempts dead-letter a job; protected manual retry recovers");
  await save(profile,"hide");await run();assert.equal(remote.properties.size,0);
  await remote.transport.upsertProperty(approved); // Acknowledged old idempotency keys return the old receipt without changing state.
  await assert.rejects(()=>remote.transport.upsertProperty({...approved,idempotencyKey:"unacknowledged-old-generation"}),/STALE_GENERATION/);
  assert.equal(remote.properties.size,0);assert.deepEqual(remote.editorial,editorial);pass("hide removes only its property; stale or duplicate older publication cannot resurrect it or touch editorial content");
  await save(profile,"publish");const token=crypto.randomUUID();const claimed=await store.claim(org,token,true);assert.equal(claimed.length,1);assert.equal((await store.claim(org,crypto.randomUUID(),true)).length,0);
  const job=claimed[0],tenantListing=await current(property),tenantConnection=await connection(org);assert.throws(()=>worker.deliveryFor(job,{...tenantListing,organization_id:other},tenantConnection),/TENANT_BOUNDARY/);
  await save(profile,"hide");assert.equal((await store.claim(org,crypto.randomUUID(),true)).length,0,"active prior lease prevents parallel delivery to same resource");
  await store.finish(job,true,null,{},actor);assert.equal((await db.query("select status from website_sync_jobs where id=$1",[job.id])).rows[0].status,"SUPERSEDED");await run();assert.equal(remote.properties.size,0);pass("leases serialize per-resource delivery and stale acknowledgements never mark the new revision synchronized");
  await save(profile,"publish");const expired=(await store.claim(org,crypto.randomUUID(),true))[0];
  await db.query("update website_sync_jobs set lease_until=now()-interval '1 second' where id=$1",[expired.id]);
  const reclaimed=(await store.claim(org,crypto.randomUUID(),true))[0];assert.equal(reclaimed.id,expired.id);assert.notEqual(reclaimed.lease_token,expired.lease_token);
  await store.finish(expired,true,null,{},actor);assert.equal((await db.query("select status from website_sync_jobs where id=$1",[expired.id])).rows[0].status,"RUNNING");
  await store.finish(reclaimed,false,"CONNECTOR_DELIVERY_FAILED",{},actor);await save(profile,"hide");await run();
  pass("expired leases recover the same durable job and reject acknowledgements from the previous worker");
  await assert.rejects(()=>role("anon","select * from website_public_page($1,null,null,null,null,24,0)",[org]),/permission denied/);
  await assert.rejects(()=>role("authenticated","select * from claim_website_jobs($1,5,$2,true)",[org,crypto.randomUUID()]),/permission denied/);
  assert.equal((await role("authenticated","select * from website_remote_resources where organization_id=$1",[other])).rows.length,0);
  await assert.rejects(()=>role("service_role","insert into website_remote_resources(connection_id,property_id,organization_id) select id,$1,$2 from website_connections where organization_id=$2",[otherProperty,org]),/foreign key/);pass("new worker and remote-state RLS/RPCs preserve tenant isolation");
  // Populate several approved resources and exercise indexed filtering/pagination in real SQL.
  for(let n=1;n<=7;n++) {
    const id=`77777777-7777-7777-7777-${String(n).padStart(12,"0")}`;await db.query("insert into properties(id,organization_id,name) values ($1,$2,'Extra')",[id,org]);
    await save({...profile,name:`Extra ${n}`,slug:`extra-${n}`,featured:n%2===0,featuredPriority:1,features:{...profile.features,petFriendly:true}},"publish",id);
  }
  const page=async(offset,featured=null)=> (await role("service_role","select listing_id,published_priority from website_public_page($1,null,null,null,$2,3,$3)",[org,featured,offset])).rows;
  assert.deepEqual(await page(0),await page(0));const p1=await page(0),p2=await page(3);assert.equal(new Set([...p1,...p2].map(p=>p.listing_id)).size,6);assert.equal((await page(0,true)).length,3);
  assert.equal((await role("service_role","select listing_id from website_public_page($1,null,'pet-friendly',null,null,100,0)",[org])).rows.length,7);
  assert.deepEqual(publication.pagination(new URLSearchParams()),{limit:24,offset:0});for(const query of ["limit=101","limit=0","offset=-1","limit=NaN"])assert.throws(()=>publication.pagination(new URLSearchParams(query)));pass("stable SQL pagination, featured ordering, collection filtering and bounded public parameters");
  const dto=domain.serializePublicListing(profile,{...facts,parking_spaces:null});const html=renderToStaticMarkup(React.createElement(Content,{listing:dto}));
  for(const label of ["Parking","Accessibility","Unknown","N/A","<p></p>","private://"])assert.equal(html.includes(label),false);
  assert.equal(domain.serializePublicListing({...profile,features:{petFriendly:false,hotTub:null}},facts).features.petFriendly,false);
  const explicit=domain.serializePublicListing({...profile,features:{petFriendly:false,hotTub:false}}, {...facts,parking_spaces:0});
  const explicitHtml=renderToStaticMarkup(React.createElement(Content,{listing:explicit}));assert.ok(explicitHtml.includes("No pets"));assert.ok(explicitHtml.includes("No on-site parking"));assert.equal(explicitHtml.toLowerCase().includes("hot tub"),false);
  assert.ok(publication.publicationDiff(dto,explicit).some(change=>change.summary==="Pet policy: No pets"));
  const known=domain.normalizeProfile({...profile,location:"Niagara"});const frozen={...known,locationKey:domain.slugify(known.location)};
  const frozenFacts={...facts,latitude:null,longitude:null};
  assert.equal(publication.candidateGeneration({state:"PUBLISHED",publication_generation:7,published_profile:frozen,published_facts:frozenFacts},known,facts),7);
  assert.equal(publication.candidateGeneration({state:"PUBLISHED",publication_generation:7,published_profile:frozen,published_facts:frozenFacts},known,{...facts,parking_spaces:0}),8);
  assert.equal((await connector.createPropertyConnector(cfg.configuration).testConnection()).ok,false);const testsBefore=remote.properties.size;await remote.transport.testConnection();assert.equal(remote.properties.size,testsBefore);pass("content-aware preview, explicit false vs unknown and read-only connection diagnostics");
  for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","172.16.1.1","192.168.1.1","::1","::ffff:127.0.0.1","fc00::1"])assert.equal(security.allowedAddress(address),false);
  assert.equal(security.allowedAddress("8.8.8.8"),true);
  for(const endpoint of ["http://website.test","https://localhost","https://127.0.0.1","https://user:password@website.test","https://website.test?token=secret"])await assert.rejects(()=>security.validateConnectorEndpoint(endpoint,async()=>[{address:"8.8.8.8",family:4}]));
  await assert.rejects(()=>security.validateConnectorEndpoint("https://website.test",async()=>[{address:"8.8.8.8",family:4},{address:"127.0.0.1",family:4}]));
  assert.throws(()=>connector.normalizeConnectorConfiguration({transport:"MOCK"}));assert.throws(()=>connector.assertDeliveryScope({...approved,scope:"WEBSITE"}));pass("SSRF/configuration/resource-scope protections reject unsafe endpoints and browser-selectable transports");
  await db.exec(readFileSync(new URL("../supabase/rollback_website_approval_worker.sql",import.meta.url),"utf8"));assert.equal((await factRow(property)).notes,"Private operational note");pass("Phase 2 rollback preserves property facts and existing approved marketing data");
  console.log(`${groups} Phase 2 workflow groups passed, including local mock StayInNiagara and disposable PostgreSQL.`);
} finally {await db.close();}
