# Website Publishing: approval, previews and targeted delivery

This extends the Website Publishing foundation. Gulera owns structured property
data; the website owns presentation and the broader website experience. Nothing
in this phase connects to production, deploys a website, enables a paid service,
or schedules a worker. StayInNiagara is the intended first external consumer, not
a tenant/domain assumption in generic publishing code.

## Ownership contract

Connectors receive one `scope: "PROPERTY"` delivery at a time. They may upsert or
unpublish that stable property entity, including its public photos, booking URLs,
amenities, collections and property SEO. They must not replace a whole site/page
tree or receive permissions to change homepage heroes, branding, navigation,
About pages, guides, restaurants/attractions, blog posts, events or editorial copy.

Featured Properties, Browse Our Stays and collection grids are **website views of
property data**. The website decides where to display them, their visual names,
layout, templates, navigation and whether to show a collection at all. Collection
membership is data; it is not an external page/layout command.

## Schema and installation

Apply the foundation migration followed by
`20261006020000_website_approval_worker.sql` in staging/disposable Supabase first.
Neither migration was applied to production by this task.

The additive migration includes:

- Connections: publishing_mode (MANUAL_APPROVAL default), bounded non-secret
  adapter configuration, configuration revision, last successful sync/test metadata.
- Listings: separate public listing UUID, frozen approved facts, published revision
  and publisher, monotonic publication generation, indexed approved collection,
  location, featured and priority projections.
- Outbox: publication revision/generation and connection revision, due time,
  lease token/expiry, RUNNING, SUPERSEDED and DEAD states in addition to old states.
- `website_remote_resources`: per-connection/per-property remote ID and URL, last
  pushed revision/generation and successful sync timestamp, with composite tenant
  foreign keys and organization-admin-only RLS.
- Versioned save/approval helpers, claims, completion, retry, diagnostics and
  indexed public page RPC. Browser/anonymous invocation is revoked; only service
  role can call them. The old internal processor now rejects calls so it cannot
  bypass leases/versioning.

The migration freezes an existing approved marketing profile with the canonical
facts available at upgrade time; it does not approve the existing working draft.
It recovers historical published revision/publisher from existing publish audit
events where available, otherwise uses the legacy revision (publisher may be
unknown). Old unversioned pending/failed jobs are retained as SUPERSEDED and the
current desired state is queued with a durable identity.

`supabase/rollback_website_approval_worker.sql` explicitly restores the foundation
functions and removes only Phase 2 schema. Export frozen facts/revisions, remote
IDs and job metadata before rollback. Operational facts, marketing snapshots and
audit logs remain. Rollback returns the application to Phase 1 behavior; deploy
matching application code with it. Do not use the full foundation rollback to
remove only Phase 2. Disposable PostgreSQL tests validate both up and down paths.

## Working draft versus approved publication

The working draft is normalized marketing copy plus the current property facts.
The publication snapshot is `published_profile` **and** `published_facts`, along
with published_revision, published_by and timestamps. Public endpoints, connectors
and the published preview serialize these approved values only.

This fixes the foundation's approval gap: previously canonical factual changes
could change public output immediately. In manual mode, description/photo/channel
changes **and factual changes** now remain pending until explicit approval. New
site readiness settings apply to subsequent approval; they do not retroactively
rewrite an existing approved snapshot.

Every marketing save or canonical fact change advances the draft revision.
Publish atomically approves copy/facts, timestamps and publisher, updates approved
filter projections, and records an outbox job. Synchronization is a separate step.
The save checks the draft revision, previously read facts and connection/settings
revision to reject stale approvals. Audit events record actor, mode, revisions,
visibility transitions and changed field names without private field values.

Explicit Hide/Private actions remove the public listing immediately and advance
the delivery generation, queuing a property-specific unpublish. Changing a draft's
enabled flag alone does not remove the currently approved publication; use Hide
for an intentional immediate removal. Editing a hidden listing never resurrects it.

Discard restores the last approved **marketing copy only**. It never rolls back
shared operational facts. Unsaved local fact edits are discarded by reloading;
facts already saved to the property remain and can still appear as pending public
changes. Explain this distinction to managers rather than silently undo operations.

## Publishing mode and auto-sync

MANUAL_APPROVAL is the default. Initial publication is always explicit. AUTOMATIC
is an opt-in organization setting: eligible saves/fact changes on an **already
published** listing atomically approve a new snapshot and queue work. Incomplete
automatic drafts retain the valid approved version. Hidden/new/private listings
still need explicit publication. Enabling automatic mode itself does not approve
all existing drafts.

Auto-sync is independent: a future scheduled worker claims due jobs only for
enabled connections with auto_update on. An authorized manual Process due updates
action can process an enabled connection regardless of that preference. Approval
does not depend on whether the website is available or whether the scheduler is on.

A future hybrid mode can evaluate the public change summary by category before
calling the same atomic snapshot approval function (facts/booking auto, photos/copy/
SEO require approval). Keep one snapshot/outbox boundary, not separate unsafe writes
per field. No hybrid rule engine is added now.

## Preview and exact public data

The property editor provides a private modern hospitality preview using the same
`serializePublicListing` allowlist as the public API and connector worker. Managers
can switch working draft/approved snapshot and desktop/mobile presentation, review
added/changed/removed public fields, then explicitly Approve & publish. Ordinary
users see a property page, not JSON.

An advanced control shows sanitized connector payload data, public media URLs,
booking destinations, collections, SEO, candidate publication revision/generation
and stable resource identity. Preview never writes to the outbox or receiver.
Candidate identity metadata is finalized atomically on approval; unsaved new
profiles need saving before they have a public listing ID. Repeated approval of an
identical snapshot does not enqueue another delivery. The human diff deliberately
excludes operational/internal image provenance and implementation metadata even
when such metadata advances the snapshot identity.

Optional copy and sections collapse completely. Unknown flags stay null internally
and absent publicly; explicit petFriendly=false can communicate “No pets.” Zero
parking is “No on-site parking,” null parking says nothing. A studio's zero bedrooms
is a meaningful value. Empty galleries, secondary booking buttons, accessibility,
parking headings, tagline, feature lists and collections do not reserve whitespace.

`WebsitePublicationReview` composes the reusable `ListingContent`; a later renderer
can use the same DTO without changing publication ownership. A future optional
`previewDraft` connector operation can submit a sanitized draft to an authenticated
preview-only receiver, return an expiring secure URL, and open/embed its real website
template. It must not publish a draft, alter live property resources, or put drafts
in anonymous public APIs. Check embed policies and preview-token expiry separately.

## Targeted connector architecture

`website-property-connector.ts` formalizes the delivery envelope and transport
boundary. The earlier `website-connectors.ts` foundation interface remains for
compatibility/configuration diagnostics. Actual versioned delivery uses:

```
schemaVersion, scope: PROPERTY,
siteId, listingId, publicationRevision, generation, configurationRevision,
idempotencyKey, operation: upsert | unpublish,
property: sanitized public DTO (upserts only)
```

Only a public listing UUID is delivered, not unrestricted operational property
objects. One remote resource maps to `(siteId, listingId)`, not to a mutable slug.
Changing a slug updates that same resource; the receiver should retain redirects
according to its own URL policy. Idempotency keys include site, listing, publication
generation and configuration revision. Receivers must atomically enforce both
idempotency and monotonic generation/configuration fencing; delayed old updates
must never overwrite a newer update or resurrect an unpublished resource.

The configuration-driven STAYINNIAGARA adapter skeleton accepts an injected
property transport. It does not select REST, webhook, CMS, direct application API
or feed as the final transport. Settings allow only UNCONFIGURED external transport;
neither a browser-selectable live transport nor a persistent production mock is
enabled. GULERA_SITE remains the network-free internal public API destination.

The in-memory `scripts/fixtures/mock-stayinniagara.mjs` implements only property
upsert/unpublish, diagnostics and remote-state lookup. Separate editorial fixtures
must remain unchanged. Tests inject it into the worker; normal production code
never imports it. No production credentials/domain/tenant/path is hard-coded.

## Worker, retries and remote status

`runWebsiteWorker` processes a bounded batch of five jobs. Claim RPCs use row locks,
SKIP LOCKED, 120-second leases and per-resource active-delivery exclusion. Obsolete
pending jobs are coalesced as SUPERSEDED, retaining history. Claims and delivery
resolve the latest approved desired state; a stale claim is not sent. Completion
checks the lease token, expiry, generation, connection revision and enablement,
so a stale receipt cannot mark a newer revision synchronized.

Failures persist only an allowlisted generic error code, attempt count and next
retry time. Delays are 30, 60, 120, 240 seconds; the fifth failure becomes DEAD and
requires attention. Manual retry resets failed/dead **current** jobs and audits the
action. Expired leases are recovered with the same identity; final expired attempts
become DEAD. Successful remote metadata lives in the mapping table, never in the
operational property record. Database completion failure leaves the lease
recoverable; repeated delivery relies on receiver idempotency.

The worker applies a 10-second connector deadline; prepared HTTPS requests have
an eight-second network timeout. Future external implementations must honor aborts
and receiver generation fencing; a deadline cannot undo a request already received.
Claims/persistence can still fail independently and should be monitored before
production scheduling. Treat failed jobs as diagnostics, not failed property saves.

`GET /api/cron/website-publishing` is prepared with CRON_SECRET bearer protection,
Node runtime and a 60-second execution budget. It is **not added to vercel.json**.
When explicitly authorized later, choose an available scheduler/frequency, check
plan limits/costs first, set CRON_SECRET server-side, apply staged migrations, and
monitor claims/dead jobs. Nothing here enables paid cron infrastructure.

## Featured properties, collections and public pagination

Featured is generic approved data. Optional featuredPriority overrides homepage
priority for the approved featured ordering; ties use stable listing UUIDs.
`?featured=true` returns only approved featured listings. Collections are indexed
approved tags/positive features/capacity classifications, never layout instructions.

All existing public routes still require `?site=<enabled GULERA_SITE connection>`:

- `/api/public/v1/properties`
- `/api/public/v1/properties/{slug}`
- `/api/public/v1/collections/{collection}`
- `/api/public/v1/locations/{location}`

List routes accept limit (default 24, maximum 100), offset (0–1000000), and optional
featured=true/false. Filtering and ordering happen in PostgreSQL before slicing.
Responses retain schemaVersion/properties and add:

```json
{"pagination":{"limit":24,"offset":0,"hasMore":true,"nextOffset":24}}
```

Detail ignores page offset and uses the approved slug. Listings include stable
listingId and publicationRevision. DTO optional fields remain omitted. Responses
stay no-store so hiding is immediate. Offset pages have deterministic ordering;
concurrent approvals/removals/reordering can move entries across pages. Consumers
requiring immutable whole-catalog exports will need a versioned/keyset export later.

The protected admin endpoint additionally supports kind test/retry/sync and the
revert action. Tests validate saved configuration and perform no content mutation;
unconfigured transports return a clear unavailable result. Diagnostics are saved
and audited with a connection revision guard; raw transport responses/secrets are
not exposed. Save settings before testing them.

## Security and media

Credentials stay in a future server-side vault/environment integration, referenced
opaquely. The browser accepts only adapter/UNCONFIGURED transport/public endpoint
configuration and publishing preferences, never tokens/passwords. Server error
codes, connection tests and worker logs contain no raw credentials/errors.

The prepared targeted HTTPS helper validates URL credentials/protocol/port, resolves
DNS, rejects private/mixed/private-mapped addresses, pins the validated address for
the request while retaining TLS hostname validation, rejects redirects, bounds
responses to 64 KiB and restricts paths to health or a single UUID property resource.
It is not wired to any live transport. Future transport implementations must use
this boundary (or an equivalent reviewed client) and least-privilege credentials.

Preserved originals, approval, hero/gallery choice, order, captions, room/category,
enhancement status and version metadata remain. Optional approved responsive
variants add public URL/width/format metadata; private original references never
enter DTOs. No upload pipeline or paid AI transformation is enabled. The policy
remains **Enhance clarity, not reality**: exposure/white balance/contrast/crop/
perspective/mild sharpening/noise reduction/responsive crops are allowed; fabricated
amenities/views, removed permanent features, resized rooms, changed finishes or
furniture, concealed defects and other misrepresentation are forbidden.

## Tests and operational limits

The full npm suite retains foundation tests and adds 18 workflow groups with an
isolated PostgreSQL WASM database and mock receiver: upgrade/rollback, manual and
automatic approval, frozen facts, diffs/preview, same-resource updates, coalescing,
duplicate delivery, failure/backoff/recovery/dead-letter/manual retry, stale leases,
RLS and tenant FKs, featured/collection pagination, optional rendering, configuration
and SSRF protection. No real Supabase or external website is called.

Still required before production: staging Supabase/PostgREST smoke tests, visual
review with real approved property photos, final receiver contract and credential
scope, durable receiver idempotency/fencing, scheduler monitoring/retention, and
approved media hosting. Disabling a connection stops delivery; it does not remove
already delivered remote resources. Hide/sync properties before permanently
disconnecting. Property deletion currently cascades local jobs/mappings; a future
external integration needs durable deletion tombstones or a guarded hide-before-delete
flow before production. No real connection should be enabled until this is resolved.

## StayInNiagara inputs and next phase

Please supply: current frontend/CMS/framework, hosting/deployment ownership, staging
environment and code access; property resource/page model and stable IDs; a scoped
integration method (API/webhook/CMS/feed); authentication supplied securely; existing
property slugs and redirect policy; the Gulera organization/site mapping; exact
property-managed sections and explicit excluded editorial areas; template/media
requirements, image hosting and ownership; booking channel preferences; licence/SEO/
location/collection display rules; desired approval/auto-sync policy and frequency;
unpublish/deletion semantics; and authorized staging/deployment procedure.

Next: select the transport from those facts, implement one scoped staging adapter,
verify receiver idempotency/fencing and deletion safeguards, compare previews using
the real templates, then run an approved single-property staging integration.
Production connection/deployment remains a separately authorized step.
