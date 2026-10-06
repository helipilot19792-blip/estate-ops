import type { serializePublicListing } from "./website-publishing.ts";
export const CONNECTOR_TYPES = ["GULERA_SITE", "CUSTOM_API", "WORDPRESS", "EMBED_WIDGET", "WEBHOOK"] as const;
export type ConnectorType = typeof CONNECTOR_TYPES[number];
export type ConnectorResult = { ok: boolean; status: "INTERNAL_API" | "UNSUPPORTED"; message: string };
export interface PublishingConnector {
  publishProperty(listing: ReturnType<typeof serializePublicListing>): Promise<ConnectorResult>;
  updateProperty(listing: ReturnType<typeof serializePublicListing>): Promise<ConnectorResult>;
  unpublishProperty(slug: string): Promise<ConnectorResult>;
  testConnection(): Promise<ConnectorResult>;
  syncStatus(): Promise<ConnectorResult>;
}
/** No network requests, credentials, AI calls, or paid services in Phase 1. */
export function connectorFor(type: ConnectorType): PublishingConnector {
  const result: ConnectorResult = type === "GULERA_SITE"
    ? { ok: true, status: "INTERNAL_API", message: "Sanitized public API is the publishing destination." }
    : { ok: false, status: "UNSUPPORTED", message: "This connector is reserved for a future phase." };
  const operation = async () => result;
  return { publishProperty: operation, updateProperty: operation, unpublishProperty: operation, testConnection: operation, syncStatus: operation };
}
