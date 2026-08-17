# Gulera OS 2.0 Phase 4 experience chooser

Implemented on 2026-08-17 on branch `codex/gulera-os-v2`. Phase 4 adds a
reversible browser-level choice between Classic Gulera and the read-only
Gulera OS 2.0 preview. It does not change authentication, roles, organizations,
operating records, database objects, or deployment settings.

## Product result

- New route: `/choose-experience`
- Classic Gulera remains the full operating workspace.
- Gulera OS 2.0 remains a read-only preview.
- The first successful admin login without a saved preference opens the chooser
  when the V2 server flag is enabled.
- Later admin logins honor the saved `classic` or `v2` browser preference.
- Classic shows a non-blocking chooser control only after the existing V2 access
  endpoint confirms that the preview is enabled and authorized.
- Every Classic escape in V2 records the Classic preference before navigating.
- The V2 top bar is sticky so the Classic escape remains visible while scrolling.

## Safety and isolation

The preference key is `gulera-os-experience`. It is stored only in browser
`localStorage`. No user, profile, membership, organization, or preference table
is read or written for the selection.

The chooser is protected by the same disabled-by-default server flag and the
same authenticated admin/platform-admin access endpoint as the V2 shell. When
the flag is disabled, `/choose-experience` redirects to `/admin`. If the V2
availability check fails inside Classic, the chooser control stays hidden and
Classic continues normally.

The login change applies only when the existing portal resolver has already
selected `/admin`. Owner, cleaner, grounds, multi-staff portal selection,
invites, password recovery, and role resolution are unchanged.

No migration, Supabase object, dependency, environment variable, Vercel project
binding, production route replacement, or external write was added.

## Validation

- Focused ESLint passes for every touched TypeScript/TSX file with zero errors.
- The Next.js 16.2.1 production build passes with 52 static pages.
- Phase 2 isolation, Phase 3 briefing, Phase 4 chooser, demo isolation, both AI
  replay suites, and both cleaner offer suites pass.
- With the V2 flag enabled, `/choose-experience` returns `200`; without an
  authenticated admin session it redirects to the existing admin login.
- With the flag absent, `/choose-experience` returns to `/admin`.
- Repository-wide lint retains the same three pre-existing hook errors in
  `components/admin/admin-operations-alerts.tsx` and
  `lib/use-team-bulletin-summary.ts`; Phase 4 introduces no lint errors.
- Authenticated chooser selection, multi-organization V2 entry, and responsive
  visual QA remain required in the authorized `fw59` preview deployment.

## Performance boundary

The chooser is a separate route chunk. Classic does not import the chooser or
V2 shell. Its optional availability probe starts 1.5 seconds after Classic auth
has completed, does not block the main workspace, and silently fails without
changing Classic rendering.

## Files changed

- `app/choose-experience/page.tsx`
- `app/login/page.tsx`
- `components/experience/experience-chooser.tsx`
- `components/experience/experience-chooser.module.css`
- `components/admin/admin-workspace.tsx`
- `components/admin-v2/admin-v2-shell.tsx`
- `components/admin-v2/admin-v2-shell.module.css`
- `lib/gulera-experience.ts`
- `scripts/test-admin-v2-experience.mjs`
- `package.json`
- `docs/gulera-os-v2/phase-4-experience-chooser.md`

## Rollout boundary

Keep `GULERA_OS_V2_ENABLED` absent or false in production. Enable it only in the
existing `fw59` preview environment for authenticated admin and platform-admin
QA. Disabling the flag restores direct Classic behavior without clearing or
migrating any browser or database state.
