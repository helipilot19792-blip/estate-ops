import { publicUrl } from "./website-publishing";
import type { PublicDTO } from "./website-publication";
export type ConnectorConfiguration = {adapter:"GENERIC"|"STAYINNIAGARA";transport:"UNCONFIGURED";endpoint?:string};
export type PropertyDelivery = {
  schemaVersion:1; scope:"PROPERTY"; siteId:string; listingId:string; publicationRevision:number;
  generation:number; configurationRevision:number; idempotencyKey:string;
  operation:"upsert"|"unpublish"; property?:PublicDTO;
};
export type DeliveryResult = {remoteId?:string;remoteUrl?:string};
export interface PropertyTransport {
  /** Must implement resource-level upsert, idempotency, and generation fencing. Never whole-site replace. */
  upsertProperty(delivery:PropertyDelivery):Promise<DeliveryResult>;
  unpublishProperty(delivery:PropertyDelivery):Promise<DeliveryResult>;
  testConnection():Promise<{ok:boolean;message:string}>;
  fetchRemoteState?(listingId:string):Promise<{revision:number;url?:string}|null>;
}
export interface PropertyConnector extends PropertyTransport {
  publishProperty(delivery:PropertyDelivery):Promise<DeliveryResult>;
  updateProperty(delivery:PropertyDelivery):Promise<DeliveryResult>;
  /** Future opt-in: authenticated draft rendering, short-lived URL, never a public feed write. */
  previewDraft?(draft:{siteId:string;listingId:string;property:PublicDTO}):Promise<{url:string;expiresAt:string}>;
}
export function normalizeConnectorConfiguration(value:unknown):ConnectorConfiguration {
  const c=(value&&typeof value==="object"?value:{}) as Record<string,unknown>;
  // No selectable live or mock transport in browser settings. Tests inject an isolated receiver.
  if(c.transport&&c.transport!=="UNCONFIGURED") throw new Error("External transports are not enabled in this phase.");
  if(c.endpoint&&!publicUrl(c.endpoint)) throw new Error("Connector endpoint must be a public HTTPS URL without credentials or query parameters.");
  return {adapter:c.adapter==="STAYINNIAGARA"?"STAYINNIAGARA":"GENERIC",transport:"UNCONFIGURED",...(c.endpoint?{endpoint:publicUrl(c.endpoint)}:{})};
}
/** Configuration-driven skeleton: no tenant, domain, credentials, filesystem or final transport assumptions. */
export function createPropertyConnector(configuration:ConnectorConfiguration,transport?:PropertyTransport):PropertyConnector {
  const selected:PropertyTransport=transport||{
    async upsertProperty(){throw new Error("CONNECTOR_NOT_CONFIGURED");},
    async unpublishProperty(){throw new Error("CONNECTOR_NOT_CONFIGURED");},
    async testConnection(){return {ok:false,message:"Property connector transport has not been configured."};},
  };
  // An adapter can later map property DTOs to a particular CMS; it cannot access raw properties or editorial content.
  void configuration;
  return {...selected,publishProperty:d=>selected.upsertProperty(d),updateProperty:d=>selected.upsertProperty(d)};
}
export function assertDeliveryScope(delivery:PropertyDelivery) {
  if(delivery.scope!=="PROPERTY"||delivery.schemaVersion!==1||!delivery.listingId||!delivery.siteId||!Number.isInteger(delivery.generation)||delivery.generation<1||!delivery.idempotencyKey) throw new Error("INVALID_PROPERTY_DELIVERY");
  if(delivery.operation==="upsert"&&!delivery.property) throw new Error("MISSING_PUBLIC_SNAPSHOT");
  if(delivery.operation==="unpublish"&&delivery.property) throw new Error("UNPUBLISH_CONTAINS_CONTENT");
}
