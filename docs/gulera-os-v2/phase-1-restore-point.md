# Gulera OS 2.0 Phase 1 restore point

Recorded on 2026-08-17 at 14:22 EDT. This document contains identifiers and
environment-variable names only. It intentionally contains no credentials,
secret values, customer records, or database contents.

## Status

The Git checkpoint, production deployment record, public visual baseline,
environment-name inventory, build baseline, test baseline, and Git rollback
checkout have been completed. The Supabase schema/data backup remains open
because the Free plan has no managed backups and the original database password
is unavailable. On 2026-08-17, the owner explicitly approved proceeding without
that backup for now and accepted it as tracked recovery debt. Owner, cleaner,
and grounds screenshots plus an organization-isolation negative test also
require authorized test sessions.

No application route, runtime component, package, deployment, Supabase object,
or production record was changed while establishing this restore point.

## Git checkpoint

- Repository: `estate-ops`
- Known-good production commit: `33178a97aac9fe5ba7ebc9fe579a4aed06017242`
- Commit subject: `Show weekdays on cleaning dates`
- Production branch at capture: `main`
- Annotated restore tag: `restore/pre-gulera-os-v2-20260817`
- Isolated implementation branch: `codex/gulera-os-v2`
- Checkpoint tree: the existing clean production commit above; no empty or
  synthetic commit was introduced before the tag.

The tag was checked out into a disposable detached worktree. Its resolved SHA
matched the known-good production commit, the worktree was clean, and the
Classic admin, owner, cleaner, and grounds page entry files were present. The
disposable worktree was removed after verification.

## Production deployment record

- Provider: Vercel
- Project name: `estate-ops-fw59`
- Project ID: `prj_28x6Bw3M5Psuwq31QuKYzgOzO8BU`
- Vercel team ID: `team_9dFAc0Os1wON23CSiRitWP9C`
- Production domain: `portal.estateofmindpm.com`
- Deployment shown as: `HirH9sG3D`
- Deployment state at capture: `Ready`, `Latest`, `Production`, `Current`
- Source branch: `main`
- Source commit shown by Vercel: `33178a9`
- Build duration shown by Vercel: `1m 5s`

The Vercel evidence came from the owner's supplied deployment screenshot and
the local `.vercel/repo.json` project binding. No deployment was created,
promoted, or changed.

### Production-critical Vercel binding

The owner has confirmed that production must remain on the existing
`estate-ops-fw59` Vercel project and project ID
`prj_28x6Bw3M5Psuwq31QuKYzgOzO8BU`. Previous attempts to change this binding
caused working functionality to fail. Do not create a replacement Vercel
project, relink this repository, rename the project, change its team binding,
or move the production domain as part of Gulera OS 2.0. Future preview and
production deployments must use this existing project unless the owner
separately approves a fully audited migration plan.

## Supabase record and remaining gate

- Project host: `dfnletmtdbzlcojbhvoi.supabase.co`
- Inferred project reference: `dfnletmtdbzlcojbhvoi`
- Local project link: not present
- Global Supabase CLI: not installed
- Supabase plan at capture: Free
- Scheduled backups: unavailable on the current plan
- PITR: unavailable/not configured on the current plan
- Schema backup: **not yet created**
- Data backup or PITR checkpoint: **not yet created**
- Local dump tooling: neither Docker nor `pg_dump` is currently installed

The owner supplied a dashboard capture confirming that the Free plan does not
include project backups. An authorized operator must complete both items below
before Phase 1 is closed:

1. Install an approved PostgreSQL client or Docker/Supabase CLI toolchain, then
   create current logical schema and data dumps using an authorized database
   connection. Handle the database password locally; never place it in Git,
   documentation, command output, or chat.
2. Place the resulting dumps in encrypted/off-site storage and record their
   capture time and checksums without recording their contents. Alternatively,
   the owner may separately approve a paid Supabase plan with managed backups,
   but enabling or purchasing that plan is outside this restore-point work.

Supabase documents managed backups and PITR at
<https://supabase.com/docs/guides/platform/backups> and the supported logical
dump workflow at
<https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore>.
Do not commit any dump. Do not paste a database password, access token, or
connection string into this document or chat.

## Environment-variable name inventory

Names present in the local protected environment at capture:

- `INVITE_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `RESEND_API_KEY`
- `STRIPE_PRICE_FOUNDING_ANNUAL`
- `STRIPE_PRICE_GROWTH_MONTHLY`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Additional names referenced by source code and therefore requiring deployment
review, even when absent from the local file:

- `CRON_SECRET`
- `GEOCODING_USER_AGENT`
- `GULERA_PUSH_SIGNING`
- `GULERA_VAPID_PRIVATE_KEY`
- `JOB_EMAIL_ACTION_SECRET`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_HELP_MODEL`
- `OWNER_LINK_SIGNING_SECRET`
- `STRIPE_WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY`

Only names were inventoried. Values were not printed or copied.

## Visual baseline

Private local artifacts are excluded from Git by `/.restore-artifacts/`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `.restore-artifacts/screenshots/admin-classic-home-private.png` | 84592 | `37107F3ED7F431CE424BDBBA02040FC24B35CFB2651F1EA05EBCC7FD35F452CC` |
| `.restore-artifacts/screenshots/portal-public-home.png` | 367169 | `1485015509F5E0A7B9E92C4BF243B31FE8C9EF943CD7979BF3836B5BDD6250BE` |
| `.restore-artifacts/screenshots/supabase-free-plan-no-backups.png` | 151749 | `B52960F5205DEEB4C4955BCAF810DE9D1EDD089F68E14DB9A06C454B10FC19FC` |
| `.restore-artifacts/screenshots/vercel-production-current.png` | 285870 | `0C013D1D13CC94DD1F3C8BE3AB93A7386AE024F4228CD85F6240BDC8C7EDC1E8` |

The public home screenshot was captured directly from production. The Vercel
screenshot is the owner's supplied deployment evidence. The Classic admin
screenshot is private and remains only in the ignored local artifact directory.
A login screenshot was discarded because the browser exposed saved autofill
content. Owner, cleaner, and grounds screenshots remain pending authorized test
sessions; no credentials should be shared in Git or documentation.

## Validation baseline

Run from the tagged production source on Windows with Node/npm dependencies
already installed:

| Check | Result |
| --- | --- |
| `npm run build` | Passed; Next.js 16.2.1 production build, TypeScript, and 49 static pages completed |
| `npm run test:ai-supervisor` | Passed; 7 evaluated findings |
| `npm run test:ai-turnover-rescue` | Passed |
| `npm run test:cleaner-offer-deadlines` | Passed |
| `npm run test:cleaner-offer-eligibility` | Passed |
| `npm run lint -- --quiet` | Failed with 3 pre-existing `react-hooks/set-state-in-effect` errors |
| Existing admin login | Passed using the browser's authorized saved session; redirected to `/admin` |
| Classic admin home | Passed; loading completed and the admin navigation/home were present |

The three lint errors are at:

- `components/admin/admin-operations-alerts.tsx:33`
- `components/admin/admin-operations-alerts.tsx:48`
- `lib/use-team-bulletin-summary.ts:48`

The full lint run reported 398 findings: 3 errors and 395 warnings. It also
reported that Babel deoptimized code generation for
`components/admin/admin-workspace.tsx` because the source exceeds 500 KB. These
are baseline findings; they were not changed during the restore phase.

Each domain test also emitted Node's existing module-type performance warning
because `package.json` does not specify `type`. No package metadata was changed.

## Validation still requiring an authorized test session

- Owner login and owner portal
- Cleaner portal
- Grounds portal
- Organization separation using accounts from at least two organizations
- Platform-admin access, if a dedicated test account exists

These checks must use non-production-changing test actions. Record the date,
account role (not identity), organization fixture, route, and pass/fail result.
Do not record passwords, session tokens, private customer data, or screenshots
that expose them.

## Phase boundary

The owner explicitly waived the outstanding Supabase backup gate for now and
approved Phase 2 on 2026-08-17. The backup requirement remains open and must be
completed before database migrations or write-capable V2 work are proposed.
