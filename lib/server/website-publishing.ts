import "server-only";
import { authenticateBearerRequest, createServiceRoleClient } from "./request-auth";
import { requireOrganizationAdmin, requirePropertyInOrganization } from "./organization-access";
import { FACT_COLUMNS, normalizeProfile, normalizeFacts, normalizeSettings, readiness, transition, uniqueSlug, validSlug, slugify, type PublicationState } from "../website-publishing";
import { CONNECTOR_TYPES, connectorFor, type ConnectorType } from "../website-connectors";
import {pagination,publicationDiff,publicationPayload} from "../website-publication";
import {normalizeConnectorConfiguration,createPropertyConnector} from "../website-property-connector";
import {runWebsiteWorker,supabaseWebsiteWorkerStore} from "./website-sync-worker";
import {serializePublicListing} from "../website-publishing";

export const CONNECTION_COLUMNS = "id,organization_id,name,website_url,connector_type,enabled,auto_update,status,settings,created_at,updated_at,publishing_mode,configuration,config_revision,last_successful_sync,last_test_at,last_test_result";
function fail(message: string, status: number): never { throw Object.assign(new Error(message), { status }); }
function uuid(value: unknown) { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail("A valid organization, property or site ID is required.",400); return value; }
export async function publishingAdmin(request: Request, organizationId: unknown) {
  const org = uuid(organizationId);
  const auth = await authenticateBearerRequest(request);
  if (!auth.ok) fail(auth.error,auth.status);
  const service = createServiceRoleClient();
  await requireOrganizationAdmin(service, auth.user.id,org);
  // Publishing requires explicit membership even for platform administrators.
  const { data: member, error } = await service.from("organization_members").select("role").eq("organization_id",org).eq("profile_id",auth.user.id).eq("role","admin").maybeSingle();
  if (error) throw error;
  if (!member) fail("Organization admin membership required.",403);
  return { service,org,actor: auth.user.id };
}
export async function adminPublishingGet(request: Request) {
  const query = new URL(request.url).searchParams;
  const {service,org} = await publishingAdmin(request,query.get("organizationId"));
  const {data: connection,error} = await service.from("website_connections").select(CONNECTION_COLUMNS).eq("organization_id",org).maybeSingle();
  if (error) throw error;
  const propertyId = query.get("propertyId") ? uuid(query.get("propertyId")) : null;
  let jobsQuery = service.from("website_sync_jobs").select("id,property_id,operation,status,attempts,last_error,created_at,completed_at").eq("organization_id",org);
  if(propertyId) jobsQuery=jobsQuery.eq("property_id",propertyId);
  const {data: jobs,error: jobsError} = await jobsQuery.select("id,property_id,operation,status,attempts,last_error,created_at,completed_at,next_retry_at,lease_until").order("sequence",{ascending:false}).limit(30);
  if (jobsError) throw jobsError;
  if (!propertyId) return { connection,jobs };
  const facts = await requirePropertyInOrganization(service,propertyId,org,`id,organization_id,${FACT_COLUMNS}`);
  const {data: listing,error: listingError} = await service.from("property_public_listings").select("*").eq("organization_id",org).eq("property_id",propertyId).maybeSingle();
  if (listingError) throw listingError;
  const {data:remote,error:remoteError}=await service.from("website_remote_resources").select("remote_resource_id,remote_url,last_pushed_revision,last_generation,last_successful_sync").eq("organization_id",org).eq("property_id",propertyId).maybeSingle();
  if(remoteError)throw remoteError;
  const published=listing?.published_facts?serializePublicListing(listing.published_profile,listing.published_facts):null;
  let publisherName:string|null=null;
  if(listing?.published_by){const {data:publisher,error:publisherError}=await service.from("profiles").select("full_name").eq("id",listing.published_by).maybeSingle();if(publisherError)throw publisherError;publisherName=publisher?.full_name||"Organization administrator";}
  return {connection,jobs,facts,listing,remote,publisherName,readiness:readiness(normalizeProfile(listing?.profile),facts,normalizeSettings(connection?.settings)),
    publishedPayload:published?{publicationRevision:listing.published_revision,property:published}:null,
    draftPayload:publicationPayload(listing?.profile,facts,listing?.revision||0),changes:publicationDiff(published,serializePublicListing(listing?.profile,facts))};
}
export async function adminPublishingPost(request: Request) {
  const raw = await request.text();
  if (raw.length > 250000) fail("Publishing request is too large.",413);
  let body;
  try {body=JSON.parse(raw);} catch {fail("Invalid JSON request.",400);}
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Invalid publishing request.",400);
  const {service,org,actor} = await publishingAdmin(request,body.organizationId);
  if (body.kind === "connection") {
    const c = body.connection;
    if (!c || typeof c.name !== "string" || !c.name.trim()) fail("Website connection name is required.",400);
    if (!CONNECTOR_TYPES.includes(c.connector_type)) fail("Unknown connector type.",400);
    let websiteUrl = "";
    if (c.website_url) {
      try { const u = new URL(c.website_url); if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) throw new Error(); websiteUrl = u.href; } catch { fail("Enter a public HTTPS website URL without credentials or query parameters.",400); }
    }
    const result = await connectorFor(c.connector_type as ConnectorType).testConnection();
    if(c.publishing_mode && !["MANUAL_APPROVAL","AUTOMATIC"].includes(c.publishing_mode)) fail("Unknown publishing mode.",400);
    let configuration;
    try {configuration=normalizeConnectorConfiguration(c.configuration);} catch(e){fail((e as Error).message,400);}
    const connection = {name:c.name.trim().slice(0,200),website_url:websiteUrl,connector_type:c.connector_type,enabled:c.enabled===true,auto_update:c.auto_update===true,status:c.enabled ? result.status : "NOT_CONNECTED",settings:normalizeSettings(c.settings),publishing_mode:c.publishing_mode||"MANUAL_APPROVAL",configuration};
    const {error} = await service.rpc("save_website_connection",{p_org:org,p_actor:actor,p_connection:connection});
    if (error) throw error;
    return {ok:true};
  }
  if (body.kind === "sync") {
    return {ok:true,...await runWebsiteWorker(supabaseWebsiteWorkerStore(service),{org,manual:true,actor})};
  }
  if(body.kind==="retry") {
    const propertyId=body.propertyId?uuid(body.propertyId):null;
    if(propertyId) await requirePropertyInOrganization(service,propertyId,org);
    const {data,error}=await service.rpc("retry_website_jobs",{p_org:org,p_property:propertyId,p_actor:actor});if(error)throw error;
    return {ok:true,retried:data};
  }
  if(body.kind==="test") {
    const {data:c,error}=await service.from("website_connections").select(CONNECTION_COLUMNS).eq("organization_id",org).maybeSingle();if(error)throw error;
    if(!c)fail("Save a website connection first.",400);
    const result=c.connector_type==="GULERA_SITE"?{ok:true,message:"Gulera public API connector is available. No content was changed."}:await createPropertyConnector(normalizeConnectorConfiguration(c.configuration)).testConnection();
    const {error:saveError}=await service.rpc("record_website_connection_test",{p_org:org,p_actor:actor,p_revision:c.config_revision,p_ok:result.ok});if(saveError)throw saveError;
    return result;
  }
  const propertyId = uuid(body.propertyId);
  const facts = await requirePropertyInOrganization(service,propertyId,org,FACT_COLUMNS);
  const {data: connection,error: connectionError} = await service.from("website_connections").select("settings,config_revision").eq("organization_id",org).maybeSingle();
  if (connectionError) throw connectionError;
  const {data: existing,error: listingError} = await service.from("property_public_listings").select("*").eq("organization_id",org).eq("property_id",propertyId).maybeSingle();
  if (listingError) throw listingError;
  if (!Number.isInteger(body.revision) || body.revision !== (existing?.revision ?? 0)) fail("Listing changed; reload before saving.",409);
  const action = body.action || "save";
  const profile = normalizeProfile(body.profile ?? existing?.profile);
  if (!profile.slug || (!existing && profile.slug === slugify(profile.name))) {
    // Preserve the established URL on subsequent name changes.
    profile.slug = existing?.published_profile?.slug || existing?.slug || "";
    if (!profile.slug) {
      const {data: occupied,error} = await service.from("property_public_listings").select("slug,published_profile").eq("organization_id",org);
      if (error) throw error;
      profile.slug = uniqueSlug(profile.name,new Set((occupied || []).flatMap(r => [r.slug,normalizeProfile(r.published_profile).slug])));
    }
  }
  if (!validSlug(profile.slug)) fail("Use a slug with lowercase letters, numbers and single hyphens.",400);
  let nextFacts;
  try {nextFacts = {...facts,...normalizeFacts(body.facts ?? facts)};} catch(e) {fail((e as Error).message,400);}
  const settings = normalizeSettings(connection?.settings);
  let state: PublicationState;
  try {state=action==="revert"?(existing?.state||"PRIVATE"):transition(existing?.state || "PRIVATE",action,profile,nextFacts,settings);} catch (e) {fail((e as Error).message,400);}
  const {error} = await service.rpc("save_website_listing",{
    p_org:org,p_property:propertyId,p_actor:actor,p_revision:body.revision,p_expected_facts:facts,p_expected_settings:typeof connection?.config_revision==="number"?{settings:connection.settings,configRevision:connection.config_revision}:connection?.settings ?? null,
    p_facts:normalizeFacts(nextFacts),p_profile:{...profile,locationKey:slugify(profile.location)},p_state:state,p_action:action,
  });
  if (error) throw error;
  return {ok:true,state,readiness:readiness(profile,nextFacts,settings)};
}
export function publishingError(error: unknown) {
  const e = error as {status?:number; code?:string; message?:string};
  const status = e.status || (e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" || e.code === "P0002" ? 404 : e.code==="22023"?400:e.code === "23505" || e.code === "40001" ? 409 : 500);
  return Response.json({error:status===500 ? "Website Publishing is unavailable. Check that the foundation migration has been applied." : status===409 ? "The listing, facts, settings or slug changed. Reload and try again." : e.message},{status,headers:{"Cache-Control":"no-store"}});
}
export async function publicPublishingGet(request: Request, filter?: {slug?:string; collection?:string; location?:string}) {
  try {
    const site = uuid(new URL(request.url).searchParams.get("site"));
    const service = createServiceRoleClient();
    const {data:connection,error} = await service.from("website_connections").select("organization_id,settings").eq("id",site).eq("enabled",true).eq("connector_type","GULERA_SITE").maybeSingle();
    if(error) throw error;
    if(!connection) fail("Website not found.",404);
    let page;
    try {page=pagination(new URL(request.url).searchParams);}catch(e){fail((e as Error).message,400);}
    const featured=new URL(request.url).searchParams.get("featured");
    if(featured!==null&&!['true','false'].includes(featured))fail("Featured must be true or false.",400);
    const {data:rows,error:readError}=await service.rpc("website_public_page",{p_org:connection.organization_id,p_slug:filter?.slug||null,p_collection:filter?.collection||null,p_location:filter?.location||null,p_featured:featured===null?null:featured==="true",p_limit:filter?.slug?1:page.limit+1,p_offset:filter?.slug?0:page.offset});
    if(readError) throw readError;
    const typedRows=(rows||[]) as {organization_id:string;state:PublicationState;published_profile:unknown;published_facts:import("../website-publishing").PropertyFacts;listing_id:string;published_revision:number}[];
    const hasMore=typedRows.length>page.limit;
    const selected=filter?.slug?typedRows:typedRows.slice(0,page.limit);
    // Approval snapshots, never current property facts. Site setting edits cannot rewrite an approval.
    const listings=selected.filter(r=>r.organization_id===connection.organization_id&&r.state==="PUBLISHED"&&normalizeProfile(r.published_profile).enabled&&r.published_facts).map(r=>({listingId:r.listing_id,publicationRevision:r.published_revision,...serializePublicListing(r.published_profile,r.published_facts)}));
    const filtered = listings.filter(l=>(!filter?.slug||l.slug===filter.slug)&&(!filter?.collection||l.collections?.includes(filter.collection))&&(!filter?.location||l.locationSlug===filter.location));
    if(filter?.slug&&!filtered.length) fail("Listing not found.",404);
    return Response.json(filter?.slug?filtered[0]:{schemaVersion:1,properties:filtered,pagination:{limit:page.limit,offset:page.offset,hasMore,nextOffset:hasMore?page.offset+page.limit:null}},{headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});
  } catch(error) {return publishingError(error);}
}
