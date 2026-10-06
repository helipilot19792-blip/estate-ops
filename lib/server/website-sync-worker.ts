import "server-only";
import {randomUUID} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {normalizeProfile,serializePublicListing,publicUrl,type PropertyFacts} from "../website-publishing";
import {createPropertyConnector,normalizeConnectorConfiguration,assertDeliveryScope,type PropertyConnector,type PropertyDelivery} from "../website-property-connector";
export type WorkerConnection={id:string;organization_id:string;enabled:boolean;connector_type:string;configuration:unknown;config_revision:number};
export type SyncJob={id:string;organization_id:string;property_id:string;connection_id:string;generation:number;config_revision:number;attempts:number;lease_token:string;publication_revision?:number};
export type ApprovedListing={organization_id:string;property_id:string;listing_id:string;state:string;publication_generation:number;published_revision:number;published_profile:unknown;published_facts:PropertyFacts};
export interface WebsiteWorkerStore {
  claim(org:string|null,token:string,manual:boolean):Promise<SyncJob[]>;
  current(job:SyncJob):Promise<{listing:ApprovedListing;connection:WorkerConnection}|null>;
  finish(job:SyncJob,ok:boolean,error:string|null,result:{remoteId?:string;remoteUrl?:string},actor:string|null):Promise<void>;
}
export function supabaseWebsiteWorkerStore(service:SupabaseClient):WebsiteWorkerStore {
  return {
    async claim(org,token,manual){const {data,error}=await service.rpc("claim_website_jobs",{p_org:org,p_limit:5,p_token:token,p_manual:manual});if(error)throw error;return data||[];},
    async current(job){
      const [a,b]=await Promise.all([
        service.from("property_public_listings").select("organization_id,property_id,listing_id,state,publication_generation,published_revision,published_profile,published_facts").eq("organization_id",job.organization_id).eq("property_id",job.property_id).maybeSingle(),
        service.from("website_connections").select("id,organization_id,enabled,connector_type,configuration,config_revision").eq("organization_id",job.organization_id).eq("id",job.connection_id).maybeSingle(),
      ]);if(a.error)throw a.error;if(b.error)throw b.error;return a.data&&b.data?{listing:a.data,connection:b.data}:null;
    },
    async finish(job,ok,error,result,actor){const {error:failure}=await service.rpc("finish_website_job",{p_job:job.id,p_token:job.lease_token,p_ok:ok,p_error:error,p_remote_id:result.remoteId||null,p_remote_url:result.remoteUrl||null,p_actor:actor});if(failure)throw failure;},
  };
}
export function deliveryFor(job:SyncJob,l:ApprovedListing,c:WorkerConnection):PropertyDelivery {
  if(l.organization_id!==job.organization_id||c.organization_id!==job.organization_id||c.id!==job.connection_id||l.property_id!==job.property_id) throw new Error("TENANT_BOUNDARY");
  const operation=l.state==="PUBLISHED"?"upsert":"unpublish";
  const delivery:PropertyDelivery={schemaVersion:1,scope:"PROPERTY",siteId:c.id,listingId:l.listing_id,
    publicationRevision:job.publication_revision??l.published_revision,generation:job.generation,configurationRevision:job.config_revision,
    idempotencyKey:`${c.id}:${l.listing_id}:${job.generation}:${job.config_revision}`,operation,
    ...(operation==="upsert"?{property:serializePublicListing(normalizeProfile(l.published_profile),l.published_facts)}:{}),
  };
  assertDeliveryScope(delivery);return delivery;
}
function defaultConnector(c:WorkerConnection):PropertyConnector {
  if(c.connector_type==="GULERA_SITE") {
    const internal={async upsertProperty(d:PropertyDelivery){return {remoteId:d.listingId};},async unpublishProperty(d:PropertyDelivery){return {remoteId:d.listingId};},async testConnection(){return {ok:true,message:"Internal public API available."};}};
    return createPropertyConnector({adapter:"GENERIC",transport:"UNCONFIGURED"},internal);
  }
  return createPropertyConnector(normalizeConnectorConfiguration(c.configuration));
}
/** Bounded worker, separately invoked after commit. No raw connector errors are logged or persisted. */
export async function runWebsiteWorker(store:WebsiteWorkerStore,options:{org:string|null;manual?:boolean;actor?:string;connector?:(c:WorkerConnection)=>PropertyConnector}) {
  const jobs=await store.claim(options.org,randomUUID(),options.manual===true);
  let succeeded=0,failed=0,superseded=0;
  for(const job of jobs) {
    let result:{remoteId?:string;remoteUrl?:string}={};let ok=false,error:string|null=null;
    try {
      const current=await store.current(job);
      if(!current||!current.connection.enabled||current.listing.publication_generation!==job.generation||current.connection.config_revision!==job.config_revision) {error="STALE_PUBLICATION";superseded++;}
      else {
        const d=deliveryFor(job,current.listing,current.connection);
        const connector=(options.connector||defaultConnector)(current.connection);
        let timeout:ReturnType<typeof setTimeout>|undefined;
        try {result=await Promise.race([d.operation==="unpublish"?connector.unpublishProperty(d):connector.updateProperty(d),new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error("REMOTE_TIMEOUT")),10000);timeout.unref?.();})]);}finally{if(timeout)clearTimeout(timeout);}
        // Discard untrusted connector metadata unless it conforms to safe, bounded public fields.
        result={...(typeof result.remoteId==="string"?{remoteId:result.remoteId.slice(0,200)}:{}),...(publicUrl(result.remoteUrl)?{remoteUrl:publicUrl(result.remoteUrl)}:{})};
        ok=true;succeeded++;
      }
    } catch {error="CONNECTOR_DELIVERY_FAILED";failed++;}
    // Persistence failures leave the lease recoverable; don't retry a successful remote write under a new identity.
    await store.finish(job,ok,error,result,options.actor||null);
  }
  return {processed:jobs.length,succeeded,failed,superseded};
}
