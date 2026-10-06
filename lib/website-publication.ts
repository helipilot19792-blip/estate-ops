import { normalizeProfile, serializePublicListing, slugify, FACT_COLUMNS, type PropertyFacts } from "./website-publishing";
export type PublishingMode = "MANUAL_APPROVAL" | "AUTOMATIC";
export type PublicDTO = ReturnType<typeof serializePublicListing>;
export type PublicationChange = {kind:"added"|"changed"|"removed";label:string;summary:string};
const LABELS: Record<string,string> = {name:"Public property name",slug:"Website URL",tagline:"Tagline",cardDescription:"Card description",description:"Full description",location:"Location",locationSlug:"Location",propertyType:"Property type",bedrooms:"Bedrooms",bathrooms:"Bathrooms",maxGuests:"Maximum guests",beds:"Beds",parkingSpaces:"Parking capacity",parking:"Parking information",accessibility:"Accessibility",licence:"Licence number",coordinates:"Public map location",hero:"Hero image",gallery:"Gallery",bookingChannels:"Booking destinations",amenities:"Amenities",highlights:"Highlights",collections:"Collections",seasonalTags:"Seasonal tags",seo:"Search engine information",featured:"Featured status",featuredPriority:"Featured order",homepagePriority:"Homepage order"};
function same(a:unknown,b:unknown):boolean {
  if(Array.isArray(a)&&Array.isArray(b)) return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
  if(a&&b&&typeof a==="object"&&typeof b==="object") {
    const x=a as Record<string,unknown>,y=b as Record<string,unknown>;
    return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>same(x[k],y[k]));
  }
  return a===b;
}
export function publicationDiff(published:PublicDTO|null,draft:PublicDTO):PublicationChange[] {
  const before=(published||{}) as Record<string,unknown>,after=draft as Record<string,unknown>;
  const changes:PublicationChange[]=[];
  for(const k of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(["schemaVersion","locationSlug"].includes(k)||same(before[k],after[k])) continue;
    if(k==="features") {
      const a=(before[k]||{}) as Record<string,unknown>,b=(after[k]||{}) as Record<string,unknown>;
      for(const feature of new Set([...Object.keys(a),...Object.keys(b)])) {
        if(same(a[feature],b[feature])) continue;
        const kind=b[feature]===undefined?"removed":a[feature]===undefined?"added":"changed";
        const label=feature.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase());
        changes.push({kind,label,summary:feature==="petFriendly"&&b[feature]===false?"Pet policy: No pets":`${label} ${kind}`});
      }
      continue;
    }
    const kind=after[k]===undefined?"removed":before[k]===undefined?"added":"changed";
    const label=LABELS[k]||k;
    const summary=typeof before[k]==="number"&&typeof after[k]==="number"?`${label}: ${before[k]} → ${after[k]}`:`${label} ${kind}`;
    changes.push({kind,label,summary});
  }
  return changes;
}
/** Exact diagnostic/connector projection, never stored draft JSON or raw property data. */
export function publicationPayload(input:unknown,facts:PropertyFacts,revision:number) {
  return {publicationRevision:revision,property:serializePublicListing(normalizeProfile(input),facts)};
}
/** Match the database's snapshot identity test, including private media provenance metadata.
 * Human change summaries intentionally compare only the public DTO.
 */
export function candidateGeneration(listing:{state:string;publication_generation?:number;published_profile?:unknown;published_facts?:PropertyFacts}|null,input:unknown,facts:PropertyFacts) {
  const profile=normalizeProfile(input);
  const savedShape={...profile,locationKey:slugify(profile.location)};
  const factShape=Object.fromEntries(FACT_COLUMNS.split(",").map(k=>[k,(facts as unknown as Record<string,unknown>)[k]??null]));
  const unchanged=listing?.state==="PUBLISHED"&&same(listing.published_profile,savedShape)&&same(listing.published_facts,factShape);
  return (listing?.publication_generation||0)+(unchanged?0:1);
}
export function pagination(search:URLSearchParams) {
  const limit=search.has("limit")?Number(search.get("limit")):24;
  const offset=search.has("offset")?Number(search.get("offset")):0;
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000) throw new Error("Use limit 1–100 and a non-negative offset up to 1000000.");
  return {limit,offset};
}
