import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
import React from "react";
import * as crypto from "node:crypto";
import {renderToStaticMarkup} from "react-dom/server";
import * as domain from "../lib/website-publishing.ts";
import * as connectors from "../lib/website-connectors.ts";

let checks=0;
function test(name,run) {run();checks++;console.log(`PASS ${name}`);}
const facts={property_type:"Cottage",bedrooms:0,bathrooms:1,max_guests:8,beds:null,parking_spaces:null,latitude:43,longitude:-79};
const profile=domain.normalizeProfile({enabled:true,name:"Quarry Hideaway",slug:"quarry-hideaway",description:"A peaceful retreat.",
  photos:[{originalUrl:"private://original",publicUrl:"https://images.example.test/hero.jpg",approved:true,hero:true,gallery:true,status:"APPROVED"}],
  channels:[{provider:"DIRECT",url:"https://book.example.test/stay",enabled:true,primary:true,priority:3}],
});
const settings=domain.DEFAULT_SETTINGS;
test("readiness supports studios, requires approved hero and configured licence",()=>{
  assert.equal(domain.readiness(profile,facts).ready,true);
  assert.ok(domain.readiness(profile,{...facts,max_guests:null}).missing.includes("Maximum guests"));
  assert.ok(domain.readiness({...profile,photos:[]},facts).missing.includes("Approved hero photo"));
  assert.ok(domain.readiness(profile,facts,{...settings,licenceRequired:true}).missing.includes("Public licence number"));
  assert.equal(domain.readiness(profile,{...facts,bedrooms:null,bathrooms:null},{...settings,roomsRequired:false}).ready,true);
  assert.equal(domain.readiness({...profile,photos:[{...profile.photos[0],status:"ORIGINAL"}]},facts).ready,false);
  assert.equal(domain.readiness({...profile,photos:[profile.photos[0],profile.photos[0]]},facts).ready,false);
});
test("publication requires deliberate action, readiness and enabled listing",()=>{
  for(const state of ["PRIVATE","DRAFT","READY","HIDDEN"]) assert.notEqual(domain.transition(state,"save",profile,facts,settings),"PUBLISHED");
  assert.equal(domain.transition("DRAFT","publish",profile,facts,settings),"PUBLISHED");
  assert.equal(domain.transition("PUBLISHED","save",profile,facts,settings),"PUBLISHED");
  assert.equal(domain.transition("PUBLISHED","hide",profile,facts,settings),"HIDDEN");
  assert.equal(domain.transition("HIDDEN","publish",profile,facts,settings),"PUBLISHED");
  assert.equal(domain.transition("PUBLISHED","save",{...profile,enabled:false},facts,settings),"PRIVATE");
  assert.throws(()=>domain.transition("DRAFT","publish",{...profile,photos:[]},facts,settings));
  assert.throws(()=>domain.transition("PRIVATE","publish",{...profile,enabled:false},facts,settings));
  assert.throws(()=>domain.transition("DRAFT","invented",profile,facts,settings));
});
test("slug generation, accent normalization and occupied URL suffixes",()=>{
  assert.equal(domain.slugify(" Quárry Hideaway! "),"quarry-hideaway");
  assert.equal(domain.uniqueSlug("Quarry Hideaway",new Set(["quarry-hideaway","quarry-hideaway-2"])),"quarry-hideaway-3");
  for(const slug of ["", "../admin","UPPER","bad--slug"]) assert.equal(domain.validSlug(slug),false);
});
test("only enabled, usable booking channels appear in primary/priority order",()=>{
  const p=domain.normalizeProfile({...profile,channels:[
    {provider:"VRBO",enabled:true,url:"https://vrbo.example.test/stay",priority:0},
    {provider:"AIRBNB",enabled:true,primary:true,url:"https://airbnb.example.test/stay?guests=4",priority:9},
    {provider:"OTHER",enabled:false,url:"https://other.example.test/stay",priority:0},
    {provider:"DIRECT",enabled:true,url:"javascript:alert(1)",priority:0},
  ]});
  assert.deepEqual(domain.enabledChannels(p).map(c=>c.provider),["AIRBNB","VRBO"]);
  assert.equal(domain.enabledChannels(p)[0].url,"https://airbnb.example.test/stay?guests=4");
});
test("tenant and publication visibility filter excludes every non-public state",()=>{
  const rows=["PRIVATE","DRAFT","READY","HIDDEN","PUBLISHED"].map(state=>({organization_id:"A",state,published_profile:profile,facts}));
  rows.push({organization_id:"B",state:"PUBLISHED",published_profile:{...profile,name:"Other tenant"},facts});
  assert.deepEqual(domain.publicListings(rows,"A",settings).map(p=>p.name),[profile.name]);
  assert.deepEqual(domain.publicListings(rows,"C",settings),[]);
});
test("explicit public allowlist excludes sensitive fields and original asset metadata",()=>{
  const secrets={door_code:"secret",access_codes:{code:"secret"},wifi_password:"secret",owner_name:"secret",cleaner_info:"secret",notes:"secret",maintenance_issues:"secret",inspection_information:"secret",financial_data:"secret",staff:"secret",contacts:"secret",documents:"secret",messages:"secret",instructions:"secret",organization_id:"secret"};
  const output=domain.serializePublicListing({...profile,...secrets},{...facts,...secrets});
  const json=JSON.stringify(output);
  for(const k of Object.keys(secrets)) assert.equal(json.includes(k),false,k);
  assert.equal(json.includes("secret"),false);
  assert.equal(json.includes("private://original"),false);
  assert.equal("coordinates" in output,false);
  assert.deepEqual(domain.serializePublicListing({...profile,showCoordinates:true},facts).coordinates,{latitude:43,longitude:-79});
});
test("optional values omitted; false and unknown remain distinct; explicit zero parking retained",()=>{
  const dto=domain.serializePublicListing({...profile,parking:" N/A ",accessibility:"Unknown",tagline:"  ",features:{petFriendly:null,hotTub:false}},facts);
  for(const key of ["parking","parkingSpaces","accessibility","tagline","cardDescription","features","beds","seo","seasonalTags"]) assert.equal(key in dto,false,key);
  assert.equal("label" in dto.bookingChannels[0],false);
  const known=domain.serializePublicListing({...profile,features:{petFriendly:false,hotTub:true}}, {...facts,parking_spaces:0});
  assert.equal(known.parkingSpaces,0);assert.deepEqual(known.features,{petFriendly:false,hotTub:true});
  const normalized=domain.normalizeProfile({features:{petFriendly:false}});
  assert.equal(normalized.features.petFriendly,false);assert.equal(normalized.features.hotTub,null);
  assert.equal(domain.serializePublicListing(profile,{...facts,bathrooms:0,beds:0}).bathrooms,undefined);
});
test("structured collections are extensible and never classify unknown/false features",()=>{
  const p=domain.normalizeProfile({...profile,features:{petFriendly:true,beachAccess:true,generator:null,hotTub:false},tags:["Family Friendly"],featured:true});
  assert.deepEqual(domain.collections(p,facts),["family-friendly","pet-friendly","beach-access","sleeps-8-plus","featured"]);
});
test("private/signed/unsafe photo URLs cannot pass approval",()=>{
  for(const url of ["javascript:alert(1)","http://example.test/a","https://localhost/a","https://127.0.0.1/a","https://a.example.test/storage/v1/object/sign/photos/a?token=x","https://a.example.test/storage/v1/object/authenticated/photos/a"]) {
    assert.equal(domain.publicUrl(url),"");
    assert.equal(domain.readiness(domain.normalizeProfile({...profile,photos:[{...profile.photos[0],publicUrl:url}]}),facts).ready,false);
  }
  assert.throws(()=>domain.normalizeFacts({...facts,max_guests:-1}));
  assert.throws(()=>domain.normalizeFacts({...facts,parking_spaces:1.5}));
});
function load(path,modules) {
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function("exports","require",code)(exports,name=>{assert.ok(name in modules,`Unexpected dependency ${name}`);return modules[name];});
  return exports;
}
const Preview=load("../components/public/listing-content.tsx",{"react/jsx-runtime":await import("react/jsx-runtime")}).default;
const publication=load("../lib/website-publication.ts",{"./website-publishing":domain});
const propertyConnector=load("../lib/website-property-connector.ts",{"./website-publishing":domain});
const syncWorker=load("../lib/server/website-sync-worker.ts",{"server-only":{},"node:crypto":crypto,"../website-publishing":domain,"../website-property-connector":propertyConnector});
test("rendered public content has no empty optional sections or placeholders",()=>{
  const html=renderToStaticMarkup(React.createElement(Preview,{listing:domain.serializePublicListing(profile,facts)}));
  for(const text of ["Parking","Accessibility","N/A","Unknown","Not supplied","hot Tub","<p></p>","<section></section>"]) assert.equal(html.includes(text),false,text);
  assert.ok(html.includes("Studio"));
  assert.equal((html.match(/<a /g)||[]).length,1,"no blank secondary booking button");
  assert.equal(renderToStaticMarkup(React.createElement(Preview,{listing:domain.serializePublicListing({}, {...facts,property_type:null,bedrooms:null,bathrooms:null,max_guests:null})})),"");
  for(const [spaces,phrase] of [[4,"Parking for 4 vehicles"],[0,"No on-site parking"]]) {
    const known=renderToStaticMarkup(React.createElement(Preview,{listing:domain.serializePublicListing({...profile,features:{petFriendly:false}}, {...facts,parking_spaces:spaces})}));
    assert.ok(known.includes(phrase));assert.ok(known.includes("No pets"));
  }
});
for(const type of connectors.CONNECTOR_TYPES) {
  const c=connectors.connectorFor(type);
  for(const operation of ["publishProperty","updateProperty","unpublishProperty","testConnection","syncStatus"]) {
    const result=await c[operation](domain.serializePublicListing(profile,facts));
    assert.equal(result.ok,type==="GULERA_SITE");
  }
}
checks++;console.log("PASS connector operations support internal API and reject unimplemented external connectors");

// Run real server handlers against a query boundary (including actual access helpers).
const orgA="11111111-1111-1111-1111-111111111111",orgB="22222222-2222-2222-2222-222222222222",siteA="33333333-3333-3333-3333-333333333333",siteB="44444444-4444-4444-4444-444444444444",propertyA="55555555-5555-5555-5555-555555555555",propertyB="66666666-6666-6666-6666-666666666666";
function harness() {
  const rows={profiles:[{id:"admin",role:"admin"}],organization_members:[{profile_id:"admin",organization_id:orgA,role:"admin"}],
    website_connections:[{id:siteA,organization_id:orgA,enabled:true,connector_type:"GULERA_SITE",settings},{id:siteB,organization_id:orgB,enabled:true,connector_type:"GULERA_SITE",settings}],
    properties:[{id:propertyA,organization_id:orgA,...facts},{id:propertyB,organization_id:orgB,...facts}],
    property_public_listings:[{property_id:propertyA,organization_id:orgA,state:"PUBLISHED",profile:{...profile,description:"Unapproved draft"},published_profile:profile,properties:facts,revision:1,published_at:"2026-10-06"},
      {property_id:propertyB,organization_id:orgB,state:"PUBLISHED",profile,published_profile:{...profile,name:"Tenant B"},properties:facts,revision:1}],website_sync_jobs:[]};
  let authenticated=true,rpcError=null;const calls=[];
  const service={from(table){let single=false;const filters=[];const q={select(){return q;},eq(k,v){filters.push(r=>(k.includes("->>")?r[k.split("->>")[0]]?.[k.split("->>")[1]]:r[k])===v);return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){const data=rows[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?data[0]??null:data,error:null}).then(resolve,reject);}};return q;},
    async rpc(name,args){
      calls.push({name,args});
      if(name==="website_public_page")return {error:rpcError,data:rows.property_public_listings.filter(r=>r.organization_id===args.p_org&&r.state==="PUBLISHED"&&(!args.p_slug||r.published_profile.slug===args.p_slug)).map(r=>({...r,published_facts:r.published_facts||r.properties,listing_id:r.property_id,published_revision:r.revision})).slice(args.p_offset,args.p_offset+args.p_limit)};
      return {data:name==="claim_website_jobs"?[]:0,error:rpcError};
    }};
  const access=load("../lib/server/organization-access.ts",{"server-only":{}});
  const handlers=load("../lib/server/website-publishing.ts",{"server-only":{},"./request-auth":{createServiceRoleClient:()=>service,authenticateBearerRequest:async()=>authenticated?{ok:true,user:{id:"admin"}}:{ok:false,status:401,error:"Unauthorized"}},"./organization-access":access,"../website-publishing":domain,"../website-connectors":connectors,"../website-publication":publication,"../website-property-connector":propertyConnector,"./website-sync-worker":syncWorker});
  return {rows,calls,handlers,setAuthenticated:v=>authenticated=v,setRpcError:v=>rpcError=v};
}
const request=(site,path="properties")=>new Request(`https://gulera.example.test/api/public/v1/${path}?site=${site}`);
const post=(body)=>new Request("https://gulera.example.test/api/admin/website-publishing",{method:"POST",body:JSON.stringify(body)});
{
  const h=harness();
  const response=await h.handlers.publicPublishingGet(request(siteA));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.properties.length,1);assert.equal(data.properties[0].name,profile.name);assert.equal(data.properties[0].description,profile.description);
  for(const state of ["PRIVATE","DRAFT","READY","HIDDEN"]) {h.rows.property_public_listings[0].state=state;assert.equal((await (await h.handlers.publicPublishingGet(request(siteA))).json()).properties.length,0);assert.equal((await h.handlers.publicPublishingGet(request(siteA),{slug:profile.slug})).status,404);}
  h.rows.property_public_listings[0].state="PUBLISHED";
  assert.equal((await h.handlers.publicPublishingGet(request(siteA),{collection:"sleeps-8-plus"})).status,200);
  assert.equal((await h.handlers.publicPublishingGet(request(siteA),{location:"missing"})).status,200);
  assert.equal((await h.handlers.publicPublishingGet(new Request("https://gulera.example.test/api/public/v1/properties"))).status,400);
  h.rows.website_connections[0].enabled=false;assert.equal((await h.handlers.publicPublishingGet(request(siteA))).status,404);
  checks++;console.log("PASS real public handler: site scope, snapshots, all private states and disabled sites");
}
{
  const h=harness();const body={organizationId:orgA,propertyId:propertyA,revision:1,profile,facts,action:"publish"};
  await assert.rejects(()=>h.handlers.adminPublishingPost(post({...body,organizationId:orgB})),/Admin access/);
  await assert.rejects(()=>h.handlers.adminPublishingPost(post({...body,propertyId:propertyB})),/not found/);
  h.rows.profiles[0].role="platform_admin";
  await assert.rejects(()=>h.handlers.adminPublishingPost(post({...body,organizationId:orgB,propertyId:propertyB})),/membership/);
  h.setAuthenticated(false);await assert.rejects(()=>h.handlers.adminPublishingPost(post(body)),/Unauthorized/);h.setAuthenticated(true);
  await assert.rejects(()=>h.handlers.adminPublishingPost(post({...body,revision:0})),/changed/);
  assert.equal(h.calls.length,0);
  await h.handlers.adminPublishingPost(post({...body,profile:{...profile,slug:"",name:"New name"}}));
  assert.equal(h.calls[0].args.p_profile.slug,"quarry-hideaway","published URLs survive name changes");
  assert.equal(h.calls[0].args.p_state,"PUBLISHED");
  assert.equal(h.calls[0].args.p_expected_settings,settings);
  const before=structuredClone(h.rows.properties);h.setRpcError({code:"503",message:"Destination unavailable"});
  await assert.rejects(()=>h.handlers.adminPublishingPost(post({organizationId:orgA,kind:"sync"})));
  assert.deepEqual(h.rows.properties,before);
  h.setRpcError(null);await h.handlers.adminPublishingPost(post({organizationId:orgA,kind:"connection",connection:{name:"Public",connector_type:"GULERA_SITE",enabled:true,password:"secret",settings:{...settings,token:"secret"}}}));
  assert.equal(JSON.stringify(h.calls.at(-1)).includes("secret"),false);
  checks++;console.log("PASS admin handlers: auth/membership, cross-tenant property denial, revision guards, stable slugs, secret rejection and sync failures");
}
const sql=readFileSync(new URL("../supabase/migrations/20261006010000_website_publishing.sql",import.meta.url),"utf8");
test("migration guards direct writes and composite tenant relationships",()=>{
  assert.ok(sql.includes("revoke all on public.%I from anon, authenticated"));
  assert.ok(sql.includes("m.organization_id=%I.organization_id"));
  assert.ok(sql.includes("references public.properties(id,organization_id)"));
  assert.ok(sql.includes("references public.website_connections(id,organization_id)"));
  assert.ok(sql.includes("from public,anon,authenticated"));
  assert.ok(sql.includes("p_expected_facts")&&sql.includes("p_expected_settings")&&sql.includes("40001"));
  assert.ok(sql.includes("public.audit_logs")&&sql.includes("public.enqueue_website_sync"));
});
console.log(`${checks} Website Publishing test groups passed (offline; no external services).`);
