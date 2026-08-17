# Gulera OS 2.0 Phase 3 read-only AI Manager

Implemented on 2026-08-17 on branch `codex/gulera-os-v2`. Phase 3 connects the
isolated V2 shell to existing organization-scoped records and turns them into a
read-only operating brief. It does not change Classic Gulera, the database,
production deployment settings, or any operating record.

## Product result

The `/admin-v2` preview now provides:

- a ranked daily AI Manager brief;
- current property, arrival, departure, turnover, maintenance, and inspection metrics;
- a 14-day checkout, turnover, and arrival timeline;
- per-property foundation readiness based on existing setup records;
- explicit recommendations that direct the operator to review work in Classic Gulera;
- a persistent Classic Gulera escape and read-only status label.

The Phase 3 analysis is deterministic and grounded in current records. It does
not call an external model, invent operating facts, or expose a write tool. This
creates an auditable foundation before any future natural-language explanation
or approval-gated action is proposed.

## Read-only data contract

The dedicated `GET /api/admin-v2/briefing` endpoint returns only a compact DTO.
It selects explicit safe columns from existing properties, booking events,
turnovers, turnover coverage, maintenance flags, inspection rules, property
setup signals, calendars, and organization membership.

The contract intentionally excludes guest names, booking summaries, access
codes, Wi-Fi credentials, maintenance notes, message bodies, invoices, payment
details, owner contact details, and full database rows.

Every root data query is restricted by `organization_id`. Child-table queries
use IDs collected from already organization-scoped parent rows. Before querying,
the endpoint:

1. verifies the supplied Supabase session token;
2. verifies the existing admin or platform-admin role;
3. verifies that the requested organization appears in the user’s authorized
   organization list;
4. applies the existing workspace billing-access rule;
5. returns private, non-cacheable data.

## Safety boundary

- The V2 server-only flag still defaults to disabled.
- Disabled `/admin-v2` redirects to `/admin`.
- Disabled access and briefing APIs both return `404`.
- The briefing route exports `GET` only.
- V2 code contains no insert, update, upsert, delete, notification, assignment,
  messaging, billing, permission, or approval execution path.
- Classic Gulera imports no V2 module and still loads independently.
- No migration, Supabase object, dependency, environment variable, or Vercel
  project binding changed.

## Performance approach

Phase 3 does not import the large Classic admin workspace. Its data endpoint uses
explicit columns, bounded 14-day operational windows, result limits, parallel
queries, and a compact response DTO. The browser loads current records only after
the existing session and organization have been verified.

## Files changed

- `app/api/admin-v2/briefing/route.ts`
- `components/admin-v2/admin-v2-shell.tsx`
- `components/admin-v2/admin-v2-shell.module.css`
- `lib/admin-v2/briefing.ts`
- `lib/server/admin-v2/briefing.ts`
- `scripts/test-admin-v2-briefing.mjs`
- `scripts/test-admin-v2-isolation.mjs`
- `package.json`
- `docs/gulera-os-v2/phase-3-ai-manager.md`

## Validation

- Focused ESLint passes for all touched TypeScript and TSX files.
- The Next.js 16.2.1 production build passes.
- Phase 3 fixture analysis and DTO tests pass.
- V2 feature-flag, GET-only API, organization authorization, and Classic escape
  isolation tests pass.
- Desktop and 390-pixel mobile browser passes show no horizontal overflow or
  hydration error.
- With the flag absent, `/admin-v2` returns `307` to `/admin`, both V2 APIs return
  `404`, and Classic `/admin` returns `200`.

## Remaining risks and next boundary

- Authenticated preview QA against live organization records is still required
  before enabling V2 for any production user.
- Platform-admin multi-organization selection needs the same preview QA.
- Owner, cleaner, and grounds portal validation remains pending authorized test
  sessions; these portals were not changed.
- The Supabase schema/data backup remains deferred under the owner’s waiver.
- Repository-wide lint retains the same three pre-existing hook errors outside
  V2.

No preview or production deployment was made. Phase 4 must not begin without
separate owner approval.
