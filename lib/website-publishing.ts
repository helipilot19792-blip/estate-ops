/** Public marketing boundary. Never serialize a property using spread syntax. */
export type PublicationState = "PRIVATE" | "DRAFT" | "READY" | "PUBLISHED" | "HIDDEN";
export type BookingChannel = { provider: "AIRBNB" | "VRBO" | "DIRECT" | "BOOKING_COM" | "OTHER"; url: string; enabled: boolean; priority: number; primary: boolean; label: string };
export type PublicPhoto = { originalUrl: string; publicUrl: string; approved: boolean; hero: boolean; gallery: boolean; order: number; caption: string; category: string; status: "ORIGINAL" | "APPROVED" | "ENHANCED"; version: string; variants?: {url:string;width:number;format:string}[] };
export const FEATURE_KEYS = ["petFriendly", "waterfront", "beachAccess", "pool", "hotTub", "golfCart", "generator", "fireplace", "workFriendly"] as const;
export type MarketingProfile = {
  enabled: boolean; name: string; slug: string; tagline: string; cardDescription: string; description: string;
  location: string; amenities: string[]; highlights: string[]; tags: string[]; seasonalTags: string[];
  features: Record<typeof FEATURE_KEYS[number], boolean | null>; parking: string; accessibility: string; licence: string;
  showCoordinates: boolean; seoTitle: string; seoDescription: string; photos: PublicPhoto[]; channels: BookingChannel[];
  featured: boolean; homepagePriority: number; featuredPriority?: number | null;
};
/** Canonical property facts added because the existing property table has no accommodation facts. */
export type PropertyFacts = { property_type: string | null; bedrooms: number | null; bathrooms: number | null; max_guests: number | null; beds: number | null; parking_spaces?: number | null; latitude?: number | null; longitude?: number | null };
export const FACT_COLUMNS = "property_type,bedrooms,bathrooms,max_guests,beds,parking_spaces,latitude,longitude";
export type PublishingSettings = { licenceRequired: boolean; roomsRequired: boolean; minimumGallery: number; preferredProvider: BookingChannel["provider"] };
export const DEFAULT_SETTINGS: PublishingSettings = { licenceRequired: false, roomsRequired: true, minimumGallery: 3, preferredProvider: "DIRECT" };
export function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
}
export function uniqueSlug(name: string, taken: Set<string>) {
  const base = slugify(name) || "property";
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base.slice(0, 90)}-${n}`;
  return candidate;
}
export function validSlug(value: string) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 100; }
export function publicUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return "";
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || !host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return "";
    // Never expose private Supabase assets or expiring signed URLs as public photos.
    if (/\/storage\/v1\/(?:object\/(?:sign|authenticated)|render\/image\/(?:sign|authenticated))\//i.test(url.pathname)) return "";
    return url.href;
  } catch { return ""; }
}
function text(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, max);
  return /^(?:n\/?a|unknown|not specified|null|undefined|-)$/i.test(trimmed) ? "" : trimmed;
}
function list(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.slice(0, 50).map(v => text(v, 100)).filter(Boolean))] : []; }
function integer(value: unknown, fallback = 0): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(10000, Math.floor(value))) : fallback; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function normalizeProfile(input: unknown): MarketingProfile {
  const p = record(input);
  const features = record(p.features);
  const providers = ["AIRBNB", "VRBO", "DIRECT", "BOOKING_COM", "OTHER"];
  return {
    enabled: p.enabled === true, name: text(p.name), slug: text(p.slug, 100), tagline: text(p.tagline), cardDescription: text(p.cardDescription, 1000), description: text(p.description, 20000),
    location: text(p.location), amenities: list(p.amenities), highlights: list(p.highlights), tags: list(p.tags).map(slugify).filter(Boolean), seasonalTags: list(p.seasonalTags).map(slugify).filter(Boolean),
    features: Object.fromEntries(FEATURE_KEYS.map(key => [key, typeof features[key] === "boolean" ? features[key] : null])) as MarketingProfile["features"],
    parking: text(p.parking, 2000), accessibility: text(p.accessibility, 2000), licence: text(p.licence), showCoordinates: p.showCoordinates === true,
    seoTitle: text(p.seoTitle, 200), seoDescription: text(p.seoDescription, 500), featured: p.featured === true, homepagePriority: integer(p.homepagePriority),
    featuredPriority: typeof p.featuredPriority === "number" ? integer(p.featuredPriority) : null,
    photos: Array.isArray(p.photos) ? p.photos.slice(0, 100).map(value => {
      const v = record(value);
      const variants = Array.isArray(v.variants) ? v.variants.slice(0,12).map(record).map(v=>({url:publicUrl(v.url),width:integer(v.width),format:text(v.format,20)})).filter(v=>v.url&&v.width>0) : [];
      return { originalUrl: text(v.originalUrl, 2048), publicUrl: publicUrl(v.publicUrl), approved: v.approved === true, hero: v.hero === true, gallery: v.gallery === true, order: integer(v.order), caption: text(v.caption), category: text(v.category), status: (["APPROVED", "ENHANCED"].includes(String(v.status)) ? v.status : "ORIGINAL") as PublicPhoto["status"], version: text(v.version, 100), ...(variants.length?{variants}:{}) };
    }) : [],
    channels: Array.isArray(p.channels) ? p.channels.slice(0, 20).map(value => {
      const v = record(value);
      return { provider: (providers.includes(String(v.provider)) ? v.provider : "OTHER") as BookingChannel["provider"], url: bookingUrl(v.url), enabled: v.enabled === true, priority: integer(v.priority), primary: v.primary === true, label: text(v.label, 100) };
    }) : [],
  };
}
export function bookingUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try { const u = new URL(value); const query = u.search; u.search = ""; u.hash = ""; return publicUrl(u.href) ? u.href.replace(/\/$/, "") + query : ""; } catch { return ""; }
}
export function enabledChannels(p: MarketingProfile) {
  return p.channels.filter(c => c.enabled && bookingUrl(c.url)).sort((a,b) => Number(b.primary) - Number(a.primary) || a.priority - b.priority).map((c, i) => ({ provider: c.provider, url: c.url, priority: c.priority, primary: i === 0, ...(c.label ? {label:c.label} : {}) }));
}
export function approvedPhotos(p: MarketingProfile) { return p.photos.filter(v => v.approved && v.status !== "ORIGINAL" && publicUrl(v.publicUrl)).sort((a,b) => a.order - b.order); }
export function readiness(p: MarketingProfile, facts: PropertyFacts, settings: PublishingSettings = DEFAULT_SETTINGS) {
  const photos = approvedPhotos(p);
  const checks: [string, boolean][] = [
    ["Public property name", !!p.name], ["Valid URL slug", validSlug(p.slug)], ["Public description", !!p.description],
    ["Maximum guests", typeof facts.max_guests === "number" && facts.max_guests > 0],
    ["Approved hero photo", photos.filter(v => v.hero).length === 1], ["Booking channel", enabledChannels(p).length > 0],
  ];
  if (settings.roomsRequired) checks.push(["Bedrooms", typeof facts.bedrooms === "number" && facts.bedrooms >= 0], ["Bathrooms", typeof facts.bathrooms === "number" && facts.bathrooms > 0]);
  if (settings.licenceRequired) checks.push(["Public licence number", !!p.licence]);
  const missing = checks.filter(([,ok]) => !ok).map(([label]) => label);
  const warnings = [!p.cardDescription && "Add a short card description", photos.filter(v => v.gallery).length < settings.minimumGallery && `Add ${settings.minimumGallery} approved gallery photos`, !p.location && "Add a public location", p.channels.filter(c => c.enabled && c.primary).length > 1 && "Choose only one primary booking channel"].filter(Boolean) as string[];
  return { score: Math.round(100 * (checks.length - missing.length) / checks.length), ready: missing.length === 0, missing, warnings };
}
export function transition(state: PublicationState, action: string, p: MarketingProfile, facts: PropertyFacts, settings: PublishingSettings): PublicationState {
  if (action === "hide") return "HIDDEN";
  if (action === "private") return "PRIVATE";
  if (action === "publish" || action === "ready") {
    if (!p.enabled || !readiness(p, facts, settings).ready) throw new Error("Complete the missing publishing requirements and enable the listing first.");
    return action === "publish" ? "PUBLISHED" : "READY";
  }
  if (action !== "save") throw new Error("Unknown publishing action.");
  // Saving never publishes new copy. A published listing retains its approved snapshot.
  return state === "PUBLISHED" && p.enabled ? state : p.enabled ? "DRAFT" : "PRIVATE";
}
export function collections(p: MarketingProfile, f: PropertyFacts) {
  return [...new Set([...p.tags, ...p.seasonalTags, ...FEATURE_KEYS.filter(k => p.features[k] === true).map(k=>slugify(k.replace(/([A-Z])/g," $1"))), ...(f.max_guests && f.max_guests >= 8 ? ["sleeps-8-plus"] : []), ...(p.featured ? ["featured"] : [])])];
}
export function serializePublicListing(input: unknown, facts: PropertyFacts) {
  const p = normalizeProfile(input);
  const photo = (v: PublicPhoto) => ({ url: v.publicUrl, ...(v.caption?{caption:v.caption}:{}), ...(v.category?{category:v.category}:{}), ...(v.variants?.length?{variants:v.variants.map(v=>({url:v.url,width:v.width,...(v.format?{format:v.format}:{})}))}:{}) });
  const photos = approvedPhotos(p);
  const hero=photos.find(v=>v.hero);
  const gallery=photos.filter(v=>v.gallery);
  const channels=enabledChannels(p);
  const tags=collections(p,facts);
  // Most negative amenities aren't useful copy. An explicit pet policy is useful.
  const features=Object.fromEntries(FEATURE_KEYS.filter(k=>p.features[k]===true || (k==="petFriendly" && p.features[k]===false)).map(k=>[k,p.features[k]]));
  return {
    schemaVersion: 1, slug: p.slug,
    ...(p.name?{name:p.name}:{}), ...(p.description?{description:p.description}:{}), ...(p.tagline?{tagline:p.tagline}:{}), ...(p.cardDescription?{cardDescription:p.cardDescription}:{}),
    ...(p.location?{location:p.location,locationSlug:slugify(p.location)}:{}), ...(text(facts.property_type)?{propertyType:text(facts.property_type)}:{}),
    ...(typeof facts.bedrooms==="number" && facts.bedrooms>=0?{bedrooms:facts.bedrooms}:{}),
    ...(typeof facts.bathrooms==="number" && facts.bathrooms>0?{bathrooms:facts.bathrooms}:{}),
    ...(typeof facts.max_guests==="number" && facts.max_guests>0?{maxGuests:facts.max_guests}:{}),
    ...(typeof facts.beds==="number" && facts.beds>0?{beds:facts.beds}:{}),
    ...(typeof facts.parking_spaces==="number" && facts.parking_spaces>=0?{parkingSpaces:facts.parking_spaces}:{}),
    ...(p.amenities.length?{amenities:p.amenities}:{}), ...(p.highlights.length?{highlights:p.highlights}:{}),
    ...(tags.length?{collections:tags}:{}), ...(p.seasonalTags.length?{seasonalTags:p.seasonalTags}:{}),
    ...(Object.keys(features).length?{features}:{}), ...(p.parking?{parking:p.parking}:{}), ...(p.accessibility?{accessibility:p.accessibility}:{}), ...(p.licence?{licence:p.licence}:{}),
    ...(p.showCoordinates && typeof facts.latitude === "number" && typeof facts.longitude === "number" && Math.abs(facts.latitude)<=90 && Math.abs(facts.longitude)<=180 ? {coordinates:{ latitude: facts.latitude, longitude: facts.longitude }} : {}),
    ...(p.seoTitle||p.seoDescription?{seo:{...(p.seoTitle?{title:p.seoTitle}:{}),...(p.seoDescription?{description:p.seoDescription}:{})}}:{}),
    ...(hero?{hero:photo(hero)}:{}), ...(gallery.length?{gallery:gallery.map(photo)}:{}), ...(channels.length?{bookingChannels:channels}:{}),
    ...(p.featured?{featured:true,...(p.featuredPriority!==null&&p.featuredPriority!==undefined?{featuredPriority:p.featuredPriority}:{})}:{}), homepagePriority: p.homepagePriority,
  };
}
export function publicListings(rows: { organization_id: string; state: PublicationState; published_profile: unknown; facts: PropertyFacts }[], organizationId: string, settings: PublishingSettings) {
  return rows.filter(r => r.organization_id === organizationId && r.state === "PUBLISHED").filter(r => { const p = normalizeProfile(r.published_profile); return p.enabled && readiness(p, r.facts, settings).ready; }).map(r => serializePublicListing(r.published_profile, r.facts));
}
export function normalizeFacts(value: unknown): Pick<PropertyFacts, "property_type" | "bedrooms" | "bathrooms" | "max_guests" | "beds" | "parking_spaces"> {
  const f = record(value);
  const number = (key: string, min: number, fractional = false) => {
    if (f[key] === null || f[key] === "" || f[key] === undefined) return null;
    const n = Number(f[key]);
    if (!Number.isFinite(n) || n < min || n > 1000 || (!fractional && !Number.isInteger(n))) throw new Error(`Invalid ${key}.`);
    return n;
  };
  return { property_type: text(f.property_type, 100) || null, bedrooms: number("bedrooms", 0), bathrooms: number("bathrooms", 0, true), max_guests: number("max_guests", 1), beds: number("beds", 0), parking_spaces:number("parking_spaces",0) };
}
export function normalizeSettings(value: unknown): PublishingSettings {
  const s = record(value);
  return { licenceRequired: s.licenceRequired === true, roomsRequired: s.roomsRequired !== false, minimumGallery: Math.min(20, integer(s.minimumGallery, 3)), preferredProvider: ["AIRBNB", "VRBO", "DIRECT", "BOOKING_COM", "OTHER"].includes(String(s.preferredProvider)) ? s.preferredProvider as BookingChannel["provider"] : "DIRECT" };
}
