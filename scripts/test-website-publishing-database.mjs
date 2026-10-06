import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {normalizeProfile,DEFAULT_SETTINGS} from "../lib/website-publishing.ts";

// PostgreSQL WASM, entirely in memory. No Supabase URL, credentials or network.
const db=new PGlite();
const orgA="11111111-1111-1111-1111-111111111111",orgB="22222222-2222-2222-2222-222222222222",propertyA="33333333-3333-3333-3333-333333333333",propertyB="44444444-4444-4444-4444-444444444444",actor="55555555-5555-5555-5555-555555555555",outsider="66666666-6666-6666-6666-666666666666";
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.organizations(id uuid primary key);
    create table public.profiles(id uuid primary key,email text,role text);
    create table public.organization_members(organization_id uuid references organizations(id),profile_id uuid references profiles(id),role text);
    create table public.properties(id uuid primary key,organization_id uuid not null references organizations(id),name text,notes text,latitude numeric,longitude numeric);
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant select on public.profiles,public.organization_members to authenticated;
    grant all on public.properties to service_role;
  `);
  await db.exec(readFileSync(new URL("../supabase/add_audit_logs.sql",import.meta.url),"utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20261006010000_website_publishing.sql",import.meta.url),"utf8"));
  await db.query("insert into organizations values ($1),($2)",[orgA,orgB]);
  await db.query("insert into profiles(id,role) values ($1,'admin'),($2,'platform_admin')",[actor,outsider]);
  await db.query("insert into organization_members values ($1,$2,'admin')",[orgA,actor]);
  await db.query("insert into properties(id,organization_id,name,notes) values ($1,$2,'Operational A','Keep private'),($3,$4,'Operational B','Other private')",[propertyA,orgA,propertyB,orgB]);
  async function asRole(role,query,params=[],user=actor) {
    return db.transaction(async tx=>{
      await tx.exec(`set local role ${role}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
      return tx.query(query,params);
    });
  }
  const config={name:"Test website",website_url:"https://website.example.test",connector_type:"GULERA_SITE",enabled:true,auto_update:true,status:"INTERNAL_API",settings:DEFAULT_SETTINGS};
  await asRole("service_role","select save_website_connection($1,$2,$3)",[orgA,actor,config]);
  await asRole("service_role","select save_website_connection($1,$2,$3)",[orgB,actor,config]);
  const profile=normalizeProfile({enabled:true,name:"Quarry",slug:"quarry",description:"An approved public retreat",features:{petFriendly:null},channels:[{provider:"DIRECT",enabled:true,url:"https://book.example.test",primary:true}],photos:[{publicUrl:"https://images.example.test/hero.jpg",approved:true,hero:true,status:"APPROVED"}]});
  const facts={property_type:"Cottage",bedrooms:2,bathrooms:1,max_guests:8,beds:null,parking_spaces:null};
  // Read PostgreSQL JSON numbers as PostgREST does (numeric driver values otherwise use strings).
  const readFacts=async id=>(await db.query("select jsonb_build_object('property_type',property_type,'bedrooms',bedrooms,'bathrooms',bathrooms,'max_guests',max_guests,'beds',beds,'parking_spaces',parking_spaces,'latitude',latitude,'longitude',longitude) as facts from properties where id=$1",[id])).rows[0].facts;
  const save=async ({org=orgA,id=propertyA,revision=0,state="DRAFT",action="save",copy=profile,expectedFacts,expectedSettings=DEFAULT_SETTINGS}={})=>{
    await asRole("service_role","select save_website_listing($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[org,id,actor,revision,expectedFacts??await readFacts(id),expectedSettings,facts,copy,state,action]);
  };
  await save();
  let listing=(await db.query("select * from property_public_listings where property_id=$1",[propertyA])).rows[0];
  assert.equal(listing.state,"DRAFT");assert.equal(listing.published_profile,null);
  await assert.rejects(()=>asRole("anon","select * from property_public_listings"),/permission denied/);
  await assert.rejects(()=>asRole("authenticated","update property_public_listings set state='PUBLISHED'"),/permission denied/);
  await assert.rejects(()=>asRole("authenticated","select process_internal_website_jobs($1,$2)",[orgA,actor]),/permission denied/);
  await assert.rejects(()=>asRole("anon","select enqueue_website_sync($1,$2,'publish',false)",[orgA,propertyA]),/permission denied/);
  assert.equal((await asRole("authenticated","select * from property_public_listings")).rows.length,1);
  assert.equal((await asRole("authenticated","select * from property_public_listings",[],outsider)).rows.length,0,"platform admins need membership too");
  await save({org:orgB,id:propertyB});
  const sameTenantProperty="77777777-7777-7777-7777-777777777777";
  await db.query("insert into properties(id,organization_id,name) values ($1,$2,'Another property')",[sameTenantProperty,orgA]);
  await assert.rejects(()=>save({id:sameTenantProperty}),/Slug already in use/);
  assert.equal((await readFacts(sameTenantProperty)).max_guests,null,"slug collision rolls back canonical fact edits too");
  assert.deepEqual((await asRole("authenticated","select organization_id from property_public_listings")).rows.map(r=>r.organization_id),[orgA]);
  assert.deepEqual((await asRole("authenticated","select id,organization_id from website_connections")).rows.map(r=>r.organization_id),[orgA]);
  await assert.rejects(()=>asRole("authenticated","select secret_reference from website_connections"),/permission denied/);
  await assert.rejects(()=>asRole("service_role","insert into website_sync_jobs(organization_id,property_id,connection_id,operation) select $1,$2,id,'publish' from website_connections where organization_id=$3",[orgA,propertyB,orgA]),/foreign key constraint/);
  await assert.rejects(()=>asRole("service_role","insert into website_sync_jobs(organization_id,property_id,connection_id,operation) select $1,$2,id,'publish' from website_connections where organization_id=$3",[orgA,propertyA,orgB]),/foreign key constraint/);
  await assert.rejects(()=>save({org:orgA,id:propertyB,revision:1}),/Property not found/);
  await assert.rejects(()=>save({revision:9}),/Listing changed/);
  const stale=await readFacts(propertyA);
  await db.query("update properties set bedrooms=3 where id=$1",[propertyA]);
  await assert.rejects(()=>save({revision:1,action:"publish",state:"PUBLISHED",expectedFacts:stale}),/facts or publishing settings changed/);
  await assert.rejects(()=>save({revision:1,expectedSettings:{...DEFAULT_SETTINGS,licenceRequired:true}}),/settings changed/);
  await save({revision:1,state:"PUBLISHED",action:"publish"});
  listing=(await db.query("select * from property_public_listings where property_id=$1",[propertyA])).rows[0];
  assert.equal(listing.state,"PUBLISHED");assert.ok(listing.published_at);assert.equal(listing.published_profile.description,profile.description);
  assert.equal((await db.query("select count(*)::integer as n from website_sync_jobs where organization_id=$1",[orgA])).rows[0].n,1);
  await save({revision:2,state:"PUBLISHED",copy:{...profile,description:"Unapproved edit"}});
  listing=(await db.query("select * from property_public_listings where property_id=$1",[propertyA])).rows[0];
  assert.equal(listing.profile.description,"Unapproved edit");assert.equal(listing.published_profile.description,profile.description);
  await save({revision:3,state:"PUBLISHED",action:"publish",copy:{...profile,description:"Now approved"}});
  assert.equal((await db.query("select published_profile from property_public_listings where property_id=$1",[propertyA])).rows[0].published_profile.description,"Now approved");
  await db.query("update properties set parking_spaces=0 where id=$1",[propertyA]);
  assert.ok((await db.query("select count(*)::integer as n from website_sync_jobs where organization_id=$1",[orgA])).rows[0].n>=3,"canonical fact update enqueues sync");
  await asRole("service_role","select process_internal_website_jobs($1,$2)",[orgA,actor]);
  assert.equal((await db.query("select distinct status from website_sync_jobs where organization_id=$1",[orgA])).rows[0].status,"SUCCEEDED");
  assert.ok((await db.query("select last_sync_at from property_public_listings where property_id=$1",[propertyA])).rows[0].last_sync_at);
  await save({revision:4,state:"HIDDEN",action:"hide"});
  assert.equal((await db.query("select state from property_public_listings where property_id=$1",[propertyA])).rows[0].state,"HIDDEN");
  assert.equal((await db.query("select operation from website_sync_jobs where organization_id=$1 order by sequence desc limit 1",[orgA])).rows[0].operation,"unpublish");
  await save({revision:5,state:"PUBLISHED",action:"publish"});
  await asRole("service_role","select save_website_connection($1,$2,$3)",[orgA,actor,{...config,connector_type:"WORDPRESS",status:"UNSUPPORTED"}]);
  const before=await readFacts(propertyA);
  await asRole("service_role","select process_internal_website_jobs($1,$2)",[orgA,actor]);
  const failed=(await db.query("select * from website_sync_jobs where organization_id=$1 and status='FAILED'",[orgA])).rows;
  assert.ok(failed.length>0);assert.equal(failed[0].attempts,1);assert.ok(failed[0].last_error);
  assert.deepEqual(await readFacts(propertyA),before);
  await asRole("service_role","select process_internal_website_jobs($1,$2)",[orgA,actor]);
  assert.equal((await db.query("select attempts from website_sync_jobs where id=$1",[failed[0].id])).rows[0].attempts,2);
  // Audit failure rolls back property facts, marketing, publication and outbox together.
  await db.exec("create function reject_website_audit() returns trigger language plpgsql as $$begin raise exception 'Audit unavailable'; end$$; create trigger reject_audit before insert on audit_logs for each row execute function reject_website_audit();");
  await assert.rejects(()=>save({revision:6,state:"PUBLISHED",action:"publish"}),/Audit unavailable/);
  assert.deepEqual(await readFacts(propertyA),before);
  assert.equal((await db.query("select revision from property_public_listings where property_id=$1",[propertyA])).rows[0].revision,6);
  await db.exec("drop trigger reject_audit on audit_logs;drop function reject_website_audit();");
  assert.ok((await db.query("select count(*)::integer as n from audit_logs where actor_profile_id=$1",[actor])).rows[0].n>10);
  await db.exec(readFileSync(new URL("../supabase/rollback_website_publishing.sql",import.meta.url),"utf8"));
  assert.deepEqual(await readFacts(propertyA),before);
  assert.equal((await db.query("select notes from properties where id=$1",[propertyA])).rows[0].notes,"Keep private");
  console.log("PostgreSQL migration/RLS tests passed: real role permissions, tenant FKs, publication snapshots, optimistic conflicts, outbox/retries, audit rollback and safe schema rollback.");
} finally {await db.close();}
