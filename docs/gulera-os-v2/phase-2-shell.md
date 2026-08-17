# Gulera OS 2.0 Phase 2 visual shell

Implemented on 2026-08-17 on branch `codex/gulera-os-v2`. Phase 2 introduces a
read-only, isolated preview shell. It does not replace or modify Classic Gulera,
change production deployment settings, or access live operating records.

## Product intent

The first shell is designed for new short-term-rental owners who need a calm
operating sequence rather than a dense software dashboard. Its visual hierarchy
starts with a daily brief, then introduces property foundations, standards,
team responsibilities, turnover rehearsal, readiness, and human approval.

All readiness values and operational cards are explicitly preview content in
this phase. Live read-only records are reserved for a separately approved
Phase 3 data contract.

## Isolation and safety

- Route: `/admin-v2`
- Feature flag: `GULERA_OS_V2_ENABLED`
- Default state: disabled
- Flag exposure: server-only; no `NEXT_PUBLIC_` V2 flag exists
- Disabled behavior: `/admin-v2` redirects to `/admin`
- Disabled API behavior: `/api/admin-v2/access` returns `404`
- Enabled unauthenticated behavior: the page redirects to the existing admin
  login and the access API returns `401`
- Authorization: the existing Supabase session token is verified server-side
- Roles: only `admin` and `platform_admin`
- Organization handling: one authorized organization opens directly; a valid
  explicit V2 browser preference may reopen; multiple ambiguous organizations
  require the user to choose before the shell opens
- Data access: the new API returns only profile display information and
  authorized organization identifiers/names
- Mutations: none; the V2 API exports `GET` only
- Classic escape: every V2 state links visibly to `/admin`
- Dependency direction: Classic imports no V2 module, and V2 imports no Classic
  workspace module

Selecting a V2 organization stores only the explicit browser preference
`gulera-os-v2-organization-id`. It does not modify a profile, role,
organization, membership, or Classic preference.

## Performance foundation

The V2 visual shell is a separate route chunk and contains no remote images or
live operational queries. In the Phase 2 production build:

- V2-specific visual chunk: 18,191 bytes raw/minified
- Classic admin workspace chunk: 722,330 bytes raw/minified

These are route-specific artifacts, not total transferred bytes, because both
routes also use shared framework/application chunks. The key isolation result
is that V2 does not import the 722 KB Classic workspace chunk.

## Files changed

- `app/admin-v2/page.tsx`
- `app/api/admin-v2/access/route.ts`
- `components/admin-v2/admin-v2-shell.tsx`
- `components/admin-v2/admin-v2-shell.module.css`
- `lib/server/admin-v2/access.ts`
- `lib/server/admin-v2/feature.ts`
- `scripts/test-admin-v2-isolation.mjs`
- `package.json`
- `docs/gulera-os-v2/phase-1-restore-point.md`
- `docs/gulera-os-v2/phase-2-shell.md`

No dependency, lockfile, Classic route, Classic component, database file,
migration, Supabase object, Vercel binding, or production environment was
changed.

## Validation

| Check | Result |
| --- | --- |
| Targeted lint on all new TypeScript/TSX files | Passed |
| `npm run build` | Passed with Next.js 16.2.1 and 50 static pages |
| `npm run test:admin-v2-isolation` | Passed |
| `npm run test:ai-supervisor` | Passed |
| `npm run test:ai-turnover-rescue` | Passed |
| `npm run test:cleaner-offer-deadlines` | Passed |
| `npm run test:cleaner-offer-eligibility` | Passed |
| Flag absent: `/admin-v2` | `307` to `/admin` |
| Flag absent: `/api/admin-v2/access` | `404` |
| Flag enabled: `/admin-v2` | `200`, preview title and Classic escape present |
| Flag enabled without session: access API | `401`, fail closed |
| Flag enabled: Classic `/admin` | `200`, existing loading scene present |
| Full lint | Same 3 pre-existing errors as Phase 1 |

The local browser correctly redirected an unauthenticated V2 visit to the
existing admin login. A complete authenticated V2 visual pass could not be run
locally because Supabase sessions are origin-scoped and the production session
does not transfer to `localhost`. It must be completed in an authorized preview
deployment before enabling V2 for any production user.

Local development also repeated the existing `next/font` network fallback
warning because the sandbox could not reach Google Fonts. The production build
itself passed.

## Enabling a future preview

Do not relink or replace `estate-ops-fw59`. After separate approval, set
`GULERA_OS_V2_ENABLED=true` only in the intended Vercel preview environment and
redeploy within the existing project. Keep the production value absent/false
until the authenticated preview, organization scoping, responsive layout, and
Classic escape have been manually verified.

Disabling requires removing the flag or setting it to `false`, then redeploying
inside the same Vercel project. The disabled route will return users to Classic.

## Remaining risks and phase boundary

- Supabase schema/data backup remains intentionally deferred by owner waiver.
- Authenticated admin and platform-admin V2 sessions still require preview QA.
- Owner, cleaner, and grounds portals were not changed; their Phase 1 role
  validation remains pending authorized sessions.
- Live portfolio data, AI recommendations, approvals, onboarding mutations, and
  external actions are not part of this shell.

Phase 3 must not begin without separate owner approval.
