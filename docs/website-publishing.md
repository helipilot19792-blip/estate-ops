# Website Publishing foundation

This is the Phase 1 foundation reference. The current approval, frozen-fact snapshot,
pagination and worker behavior is documented in [Website Publishing approval](website-publishing-approval.md),
which supersedes the Phase 1 live-fact/manual-processor limits described below.

Gulera remains the operational source of truth. A tenant's property has a separate,
editable marketing draft; explicit publication approves a snapshot for its public
website. No Phase 1 code changes an external website or calls AI/paid services.

## Data model and installation

Apply `supabase/migrations/20261006010000_website_publishing.sql` through the existing
Supabase migration process. This change has **not** been applied to a live database.
The migration assumes the existing organizations, profiles, organization_members,
properties (including latitude/longitude), and audit_logs foundation is installed.

- Canonical nullable accommodation facts on `properties`: property_type, bedrooms,
  bathrooms, max_guests, beds, parking_spaces. The existing codebase had no property
  columns for these facts (quote snapshots aren't canonical property facts).
- `property_public_listings`: property and organization relationship, lifecycle,
  unique draft slug, normalized marketing JSON, published marketing snapshot,
  optimistic revision, publication/hide/sync timestamps.
- `website_connections`: organization website URL/name/type, explicit enabled
  flag, automatic update preference, publishing/booking settings, connection status,
  future server-side vault reference, timestamps. Phase 1 allows one connection per
  organization. Each connection has a random public site ID.
- `website_sync_jobs`: durable tenant-scoped outbox with operation, ordered sequence,
  status, attempts, error, and timestamps. No additional hosted job infrastructure.

The marketing JSON contains bounded, allowlisted public copy, nullable feature
flags, amenities, highlights, managed collection/seasonal tags, SEO, selected images,
booking channels, featured status, and homepage ordering. These nested entities
are saved atomically with the listing; normalization is centralized in
`lib/website-publishing.ts`. Property facts aren't duplicated in this JSON.

`supabase/rollback_website_publishing.sql` is a **manual rollback**. Export marketing,
connection, and job data first: those three new tables are removed. Existing
property data, newly populated canonical accommodation facts, and audit history
are preserved. The up migration is transactional; do not rerun an already applied
migration manually. No backfill publishes existing properties.

## Public/private boundary and tenant isolation

Anonymous callers cannot read any publishing tables or invoke publishing RPCs.
Authenticated browsers can read only publishing rows belonging to organizations
where they have explicit admin membership; platform admins also need membership.
Direct browser writes are revoked. Vault references are excluded from browser
column grants and API selections. Composite foreign keys ensure a marketing
profile and its connection/jobs cannot point into another tenant.

The bearer-authenticated admin API verifies identity, organization admin membership,
and the property's organization before using service-role operations. Database
functions are callable only by service_role. Function search paths are fixed;
property facts, marketing saves, publication snapshots, auditing, and outbox work
commit together. Revision checks and comparison of previously read property facts
and publishing settings reject stale approvals rather than overwrite them.

Public APIs select only accommodation facts from the operational property. They
never return raw property records, draft marketing JSON, original image references,
owner/cleaner/staff information, access/Wi-Fi codes, operational instructions,
maintenance, inspections, financials, documents, or private contacts/messages.
`serializePublicListing` builds every public field explicitly, including nested
photo and booking fields. Arbitrary extra fields are discarded at both input and
output boundaries. Copy is plain text; website consumers must escape it, never
interpret descriptions/captions as HTML.

Enabling a site is an explicit organization-level public exposure gate. The site
ID identifies a public namespace, **not a secret or authorization token**. The API
does not infer tenants from a caller-supplied organization or Host header.

## Lifecycle, approval, and URLs

- PRIVATE: default; no marketing profile is created or published automatically.
- DRAFT: enabled editable copy, still private.
- READY: explicit readiness acknowledgement, still private.
- PUBLISHED: explicit Publish/Republish action passes required checks, approving a
  snapshot. Draft saves keep the previously approved copy publicly visible.
- HIDDEN: hide/unpublish immediately removes the listing from public APIs.

Disabling a listing moves it to PRIVATE. Disabling the connection hides its entire
feed. Republish approves new copy/photos/channels and records sync work. Mark ready
is unavailable on a currently published listing; hide it first to move backward.

Canonical accommodation facts are inherited live by approved listings: factual
updates can change public output without reapproving unchanged marketing copy.
With automatic updates enabled, a database trigger records sync work for published
properties when those facts (or opted-in coordinates) change. If required facts or
site requirements become incomplete, the API suppresses the listing until fixed.
Coordinate fields remain omitted unless explicitly approved in the snapshot.

Slugs are normalized from public names, with numeric suffix suggestions for
collisions. Uniqueness is per organization/site. Database checks reserve both
draft and established published slugs. Renaming a property preserves its established
URL; manually editing the slug is intentional and changes the URL on republish.
Phase 1 does not implement redirects. Retained published slugs also remain reserved
for hidden listings to prevent accidental reassignment.

## Optional content and truthful unknowns

Public output omits empty strings, whitespace, placeholder values such as N/A or
Unknown, empty lists/objects, and missing optional fields. Consumers must render
sections only when the corresponding fields exist. `components/public/listing-content.tsx`
demonstrates this policy and is shared by the private preview. It reserves no space
for missing tagline, parking, accessibility, features, collections, licence, photos,
or secondary booking channels. React escapes all public copy.

Feature flags have three values: true, false, null. Missing features normalize to
null, never false. `petFriendly=false` is meaningful and renders “No pets”; unknown
pet policy is omitted. Other explicitly negative amenity flags are stored for
classification but generally omitted from public copy (e.g. no hot tub claim).
Collections include only positive features. Parking capacity is canonical and
nullable: 4 means “Parking for 4 vehicles,” 0 means “No on-site parking,” null means
no count or parking section. Zero bedrooms means a studio. Zero beds/bathrooms are
not presented as accommodation counts; positive bathroom count is required when
room checks apply. Sorting priority is metadata, never a visible accommodation fact.

## Website readiness

`readiness` returns a simple percentage of fulfilled required checks, a ready
boolean, missing requirement names, and nonblocking warnings. Required: public
name, valid slug, public description, positive capacity, exactly one usable approved
hero photo, enabled usable booking channel. Bedrooms/bathrooms are required by
default, configurable for other accommodation types. Licence requirement is
organization-configurable. Short description, location, multiple primary channels,
and insufficient gallery images generate warnings; missing optional copy never
creates placeholder content on the public page. Settings can expand with new rules.

## Booking channels and photos

Providers: AIRBNB, VRBO, DIRECT, BOOKING_COM, OTHER. Each channel has URL, enabled,
priority, primary preference, optional public label. Only enabled usable HTTPS
channels are returned, primary first then increasing priority. The serializer
selects exactly one effective primary; the editor allows selecting a single primary.
Site settings provide the default preferred provider for newly added channels.
Booking URLs support query parameters, but credentials and non-HTTPS URLs are
rejected. Buttons receive sensible provider labels only for existing channels.

Photos record original reference (private admin metadata), approved public URL,
approval flag, hero/gallery flags, order, caption, room/category, status, and version
metadata. Public output includes only approved APPROVED/ENHANCED photos with usable
permanent HTTPS URLs; original references and processing metadata never leave the
admin boundary. Signed/private Supabase storage URLs, credentials, query-bearing
photo URLs, and local/IP URLs are rejected. Approval asserts suitability; Phase 1
does not fetch images to verify dimensions or availability. Existing private cover,
inspection, knowledge, and SOP photos aren't automatically exposed. Upload/copy to
a dedicated public media pipeline is Phase 2; use approved externally hosted public
URLs for now.

### Image truthfulness policy: Enhance clarity, not reality

Future processing may improve exposure, white balance, contrast, crop, perspective,
mild sharpening/noise reduction, and responsive crops. It must never add amenities,
remove permanent features, change views or materially change room size, change
finishes/furniture, conceal meaningful defects, or otherwise misrepresent a property.
Keep originals, processing metadata, and human approval. No paid or generative
image processing is enabled in this foundation.

## Versioned public API

Every endpoint requires `?site=<website_connection_uuid>` for an enabled GULERA_SITE
connection. Only PUBLISHED, enabled, currently ready snapshots appear. Responses use
`Cache-Control: no-store` so hidden listings cannot remain in an application cache.
Anonymous GET responses permit cross-origin public website consumption.

- `GET /api/public/v1/properties?site=...`
- `GET /api/public/v1/properties/{slug}?site=...`
- `GET /api/public/v1/collections/{collection}?site=...`
- `GET /api/public/v1/locations/{location}?site=...`

List/filter responses: `{ schemaVersion: 1, properties: [...] }`. Detail responses
contain one sanitized DTO with schemaVersion 1. Missing/private/hidden detail or
disabled/unknown website returns 404; missing/invalid site ID returns 400. Slugs and
location/collection names use lowercase hyphenated URLs. Examples: pet-friendly,
waterfront, beach-access, sleeps-8-plus, generator, golf-cart, work-friendly, featured.
Managed tags can supply beach, family-friendly, winter-ready, or other collections.
Optional DTO keys are absent, not null or empty placeholders. `schemaVersion`, slug,
and homepagePriority are structural metadata. Phase 1 feed queries are capped at
1,000 rows; production pagination is a Phase 2 requirement for larger catalogs.

Admin `GET /api/admin/website-publishing?organizationId=...&propertyId=...` loads the
profile, property facts, readiness, connection and job history. Omit propertyId for
organization settings. `POST` supports listing actions save/ready/publish/hide/private,
kind connection, and kind sync. All require an authenticated organization admin.

## UI

Admin → Properties → Setup selected property → **Website / Marketing** contains
Public Listing, Booking, Photos, Highlights, SEO, Publishing sections, readiness,
content-aware private preview, explicit Publish/Republish and Hide controls, and sync
status/retry. Public facts are labeled as shared property data. Website settings
are under **Properties → Settings → Website & Publishing**, following the existing
workspace's card/section design (there was no standalone organization settings page).
Edits are protected when leaving the marketing tab/property/organization.

## Connector and synchronization architecture

`lib/website-connectors.ts` defines publishProperty, updateProperty, unpublishProperty,
testConnection, and syncStatus. GULERA_SITE is an internal, network-free public API
destination. CUSTOM_API, WORDPRESS, EMBED_WIDGET, and WEBHOOK are reserved interfaces;
they return unsupported, never pretend to update an external website.

The foundation's internal processor performs the equivalent no-op acknowledgement
in a database transaction: ordered jobs complete for enabled GULERA_SITE connections;
unimplemented/disabled connections produce FAILED jobs with errors. “Synchronization”
here means acknowledging the internal API destination, not external delivery. The
processor persists attempts, completion/error, sync timestamps, and existing audit
events. The organization admin explicitly clicks Process/retry; no cron or paid job
service is created. Saving never awaits an external connector. Connection changes
record update jobs for existing published listings. Jobs are processed in batches
of 100; click again for further work.

Production external workers must dispatch through the TypeScript connector interface,
use leases/timeouts, retries with backoff, idempotency keys, revision/generation checks,
and resolve the **latest desired publication state** before delivery. Supersede obsolete
jobs: a delayed publish must not resurrect a hidden listing. Persist results in
tenant-scoped jobs with sanitized errors, not property records. Add observability,
dead-letter handling, bounded retention and pagination. An external outage must
never roll back a committed Gulera property save.

No website passwords/tokens are accepted in connection settings. Future secrets
belong in a server-side vault/environment-backed secret manager, represented only
by opaque references in this table. Browser APIs must not return those references.

## Audit and tests

Existing `audit_logs` records who/when for saves, readiness, publish/hide/private,
connection changes and sync attempts. Listing events include prior/next lifecycle,
revision, and changed marketing/fact field names (without secret content).

`npm test` includes the existing tests plus publishing domain/real-handler/render
checks and actual PostgreSQL migration/RLS/transaction tests. PostgreSQL tests use
the development-only PGlite dependency entirely in memory; no live Supabase data
or credentials. They verify role privileges, tenant FKs, snapshot save/republish,
optimistic conflicts, fact triggers, retries, failed sync preserving facts, atomic
audit rollback, and migration rollback. Supabase/PostgREST staging smoke testing
remains required before a production migration (PGlite doesn't emulate PostgREST
or the project's entire existing production policy graph).

## Phase 2 and StayInNiagara

Estate of Mind / StayInNiagara.com is the intended first integration consumer/test
case only. No tenant names, domains, credentials, or website technology are baked
into services/schema. A later connector must consume this tenant's explicit public
DTO, with no operational property access.

Needed from the user before that work: website technology/hosting and code access,
staging URL/environment, authorized integration method and securely supplied scoped
credentials, Gulera organization/site mapping, existing property URLs/redirect needs,
public image hosting and approval workflow, required licence/display rules, booking
destinations/priority, desired templates/collections, sync frequency and deletion
semantics, and deployment approval. Begin with staging and one approved property.

Phase 2 should add the first external adapter, approved public media upload pipeline,
production worker/retry safeguards, pagination/observability, and staging contract
tests. Multiple connections per organization would require promoting settings into
an organization publishing settings record and per-site publication eligibility.
Implement none of these external changes until explicitly instructed.
