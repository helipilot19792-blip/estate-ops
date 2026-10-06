# Company announcements

Open **Team → Company announcements**. Choose a company update, survey invitation,
or testimonial request. Audiences are Everyone, Owners, Cleaners, Grounds staff,
and Admins. Everyone is the union of the selected organization's account directories
and admin memberships, never another organization's contacts. Choose the entire
audience or individual contacts. The individual picker shows up to 1,000 contacts;
full-audience sends select every eligible address in PostgreSQL.

Write plain text and optionally add an HTTPS button link. Surveys and testimonial
requests require a link to an existing form/review destination; this feature sends
invitations, it does not collect survey responses or publish testimonials itself.

**Save draft & preview** persists even incomplete drafts and calculates the deduplicated recipient list for review. Unsaved edits trigger a navigation warning; save before leaving.
Missing/invalid addresses and opted-out contacts are excluded. Review the exact
recipient count and message, then **Confirm & send individually**. Confirmation
queues durable recipient records, and the worker processes five at a time. Each
provider request has exactly one To address and no CC/BCC. Personal greetings use
only that recipient's name and role. Replies go to the company's reply-to address. Queueing
is idempotent; queued copy, recipient addresses, and sender settings are immutable.
To send different copy, create a new message.

History shows draft messages and per-recipient delivery status. SENT means accepted
by the provider, not delivered, read, or clicked. No open/click tracking or delivery
webhook integration is included. If you leave, resume **Process queued emails**.
Failed messages use backoff and can be manually retried. Five failures or uncertain
attempts older than 23 hours are held for review. Do not resend held messages without
checking provider receipts first. Resend retains [idempotency keys for 24 hours](https://resend.com/changelog/idempotency-keys);
the shorter recovery window prevents blind retries outside that protection.

Each email includes a preferences link. Opening the link does not change anything;
the recipient explicitly confirms stopping announcement emails. Opt-out applies to
all three message types and all audience roles for that email address within that
company. It does not affect operational notifications, invoices, or account access.
Opt-outs are checked during recipient creation and before delivery; an email already
being accepted by the provider cannot be recalled. Deleted accounts or changed email
addresses and inactive accounts are skipped before claim and checked again immediately before provider submission. Duplicate directory entries with the same
normalized email receive one message.

## Setup

Apply `supabase/migrations/20261006030000_company_announcements.sql` through the normal
reviewed database migration process. It adds campaigns, recipient receipts, opt-outs,
RLS, composite tenant FKs, service-only RPCs, optimistic revision guards, and audit
events. Existing Website Publishing architecture is untouched. The optional rollback
removes only announcement tables/functions; export announcement delivery history and
preferences first. Existing account data and audit history remain. After the communications-center upgrade, do not run the foundation-only rollback: it does not reverse the new dependent functions/tables.

Apply additive `supabase/migrations/20261006040000_communications_center.sql` after the foundation migration. It preserves broadcasts, receipts, preferences, accounts and audit records. It adds organization templates, isolated test-send records, schedule/category/channel fields, role/attempt timestamps, review summaries, and service-only management/worker RPCs. Existing QUEUED campaigns become SENDING; existing small draft snapshots remain explicitly selected recipients. EMAIL is the only enabled channel. The channel field leaves room for future implementations without adding SMS or push infrastructure.

Sending reuses existing `RESEND_API_KEY` and organization invoice sender/reply-to
settings, with `INVITE_FROM_EMAIL` as the existing sender fallback. Configure
`NEXT_PUBLIC_APP_URL` to Gulera's canonical HTTPS origin, or use Vercel's
`VERCEL_PROJECT_PRODUCTION_URL`. The app blocks send confirmation until configuration
is available; no API key is returned to the browser. Sender and origin are frozen at
queue time so a retry uses the exact same provider payload. Live sending, test sending, manual processing and cron processing additionally require `COMPANY_ANNOUNCEMENTS_EMAIL_ENABLED=true`. This flag is deliberately not enabled by this work. Obtain production approval before enabling it. Draft/template operations do not require an email provider. Scheduling requires complete sender/provider configuration to freeze the eventual payload, but can be prepared with delivery disabled.

The protected `/api/cron/company-announcements` endpoint is prepared, but no cron
schedule is enabled. A scheduler can later process due recipients independently of
an open browser. Manual processing works immediately after schema/configuration setup.
This change sends no real email, enables no paid infrastructure and applies no live migration. Future live sends use
the existing email service's allowance and billing configuration.

## Security and validation

Admin profile role plus explicit membership in the selected organization are
required, including platform admins. Recipients come from server-side tenant-scoped
directories; clients cannot supply arbitrary To/CC/BCC addresses. Recipient tokens
are unavailable through authenticated column grants and admin DTOs. HTML escapes all
user content; subject/email validation rejects header/address injection. Link URLs
must be public HTTPS and cannot contain embedded credentials. The link is never
fetched by Gulera. Delivery calls use a fixed Resend endpoint, an 8-second timeout,
and no redirects. Raw provider errors and contact data are not logged. Only generic
failure codes are persisted. Worker leases last two minutes, claims use SKIP LOCKED,
and receipt retries retain the same recipient idempotency key and payload.
Immediately before submission, the worker rechecks its lease with a margin longer than the provider request timeout, the safe retry window, and current recipient eligibility. Expired workers cannot submit or overwrite a newer worker's receipt.

`npm run test:company-announcements` exercises the actual migration and rollback in
disposable PostgreSQL with real roles/RLS and a fake mail provider. It covers group
and individual audiences, tenant boundaries, deduplication, invalid addresses,
immutable approved sends, privacy, lease recovery, lost receipts, retry limits,
opt-outs, changed contacts, escaping and optional content. No test sends real mail.

## Communications center workflow

Start blank or apply an organization template, select an audience, write, save, review, send a test to yourself, and confirm Send Now or Schedule. Templates are managed in a collapsible panel so the usual compose flow stays small. A test uses current unsaved copy, sends only to the requesting admin's authenticated email, carries a [TEST] subject prefix, and uses separate test records and idempotency keys. It never changes real recipient records, broadcast state or summary counts. The test preferences link changes no real preferences. Edited content gets a fresh test identity; retrying an unchanged test retains its identity.

Allowed variables are `{{first_name}}`, `{{full_name}}`, `{{company_name}}`, and `{{role}}`, in the subject, message and button label. Name fallbacks are “there”, company is “our team”, and role is “team member”. Values are literal text and HTML escaped; unknown or malformed tokens are rejected. Variables are not supported in URLs. A default greeting is omitted when the body already contains a name variable. Delivery renders the frozen recipient name/role with the frozen sender company name. The preview illustrates the first reviewed recipient.

Templates contain name, category, type, subject, body, CTA, creator/updater and timestamps. Organization admins can create, update with revision checks, duplicate or archive. No template stores an audience. Applying one starts a new draft with no previous recipient selection. Duplicate Broadcast also creates a new DRAFT identity with content/category only and no recipient rows. Choose an audience and save/review it before confirming.

Final review shows the intended recipient set, current eligible count, snapshot exclusions, subsequent opt-outs/unavailable contacts, personalized copy, CTA and send timing. Empty subject/body, invalid URLs/tokens and no eligible recipients block confirmation. Large audiences receive an additional warning. The approved set is the exact set reviewed; later arrivals are never silently added. Late opt-outs/ineligibility can only reduce delivery. Existing history remains intact and retries never re-enable preferences.

Schedules store UTC `timestamptz` plus the selected IANA timezone. The default comes from the organization's timezone/time_zone field if available, otherwise America/Toronto. Date/time input rejects ambiguous or nonexistent daylight-saving wall times. Schedule bounds are one minute through 366 days ahead. SCHEDULED broadcasts can be cancelled or returned to DRAFT for changes and reconfirmation before the worker starts. Campaign row locks serialize cancellation/editing with the first worker claim. The durable database queue works independently of an open browser. No recurring scheduler is enabled here; configure the existing protected worker hook through an approved production scheduler to execute schedules.

States are DRAFT, SCHEDULED, SENDING, COMPLETED, COMPLETED_WITH_ERRORS, CANCELLED (legacy QUEUED is accepted during migration compatibility). Each intended recipient retains its own immutable ID and provider key. Confirmation is idempotent, worker claims use fenced leases, and accepted recipients are never resent by Retry Failed. Only eligible FAILED rows within the safe retry window are retried; SENT, OPTED_OUT, SKIPPED, EXCLUDED and REVIEW are not. Attempt count, latest generic error, last attempted time and successful retry time appear in detail. Provider acceptance is labelled Accepted, never Delivered. Do not manually reset REVIEW to work around the provider's idempotency window; verify receipts first.

History filters cover subject, category/type, status, audience, created date range, sender/admin and recipient name/email, with pages of 50. Date boundaries use database UTC days; displayed times use the browser locale except the schedule review, which explicitly uses its selected zone. Individual recipient detail is capped at 1,000 rows; aggregate counts cover the entire campaign. Template picker loads up to 100 active templates.

Every read/write continues to require an admin profile and admin membership in the specific organization. The same administrator ability governs viewing, composing, sending, scheduling, template management and delivery detail. Service-only RPCs and RLS protect test payloads, contacts and delivery secrets. Audits record draft edits, tests, schedule confirmation/change/cancellation, provider acceptance, retries and template operations without message bodies or credentials.

`npm run test:communications-center` upgrades the existing disposable PostgreSQL fixture and checks incomplete drafts, revisions, personalization/fallbacks, privacy, unsafe CTA/tokens, DST, scheduling/edit/cancellation, snapshots, opt-outs, failed-only retries, lost receipts, post-claim withdrawal, templates, duplicate broadcasts, isolated tests, forged test destinations, live-send gating, truthful summaries, history, tenant permissions and auditing. All delivery uses a fake provider/fetch; no network email calls occur.

Possible next improvements: provider delivery/bounce webhooks (with signature verification and deduplication), schedule-worker monitoring, granular communication abilities if needed, and template pagination when organizations exceed the current picker size.
