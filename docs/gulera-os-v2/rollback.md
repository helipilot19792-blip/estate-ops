# Gulera OS 2.0 rollback procedure

This runbook restores the application source to the verified pre-V2 checkpoint.
It does not authorize a production deployment or a database restore. Both are
external/state-changing actions and require an explicit owner decision at the
time they are performed.

## Verified checkpoint

- Tag: `restore/pre-gulera-os-v2-20260817`
- Commit: `33178a97aac9fe5ba7ebc9fe579a4aed06017242`
- Production domain at capture: `portal.estateofmindpm.com`
- Vercel project: `estate-ops-fw59`

The `estate-ops-fw59` project binding is a production invariant. Do not relink
the repository to a new Vercel project, rename or replace the project, change
its team binding, or move the production domain during rollback. Previous
attempts to change this binding caused working functionality to fail.

## Preferred application rollback

Preserve V2 history by creating a new rollback branch rather than resetting or
deleting the V2 branch:

```powershell
git fetch --tags origin
git show --no-patch --format="%H %D %s" restore/pre-gulera-os-v2-20260817
git switch -c codex/rollback-gulera-os-v2 restore/pre-gulera-os-v2-20260817
npm install
npm run build
npm run test:ai-supervisor
npm run test:ai-turnover-rescue
npm run test:cleaner-offer-deadlines
npm run test:cleaner-offer-eligibility
```

Expected SHA from the `git show` command:

```text
33178a97aac9fe5ba7ebc9fe579a4aed06017242
```

After review, push this rollback branch and deploy it through the normal Vercel
review/production process. Confirm the deployment is bound to
the existing `estate-ops-fw59` project and `portal.estateofmindpm.com` before
promoting it. Do not force-push `main` and do not delete the V2 branch as part
of rollback.

## Fast V2-only containment

Once Phase 2 introduces its server-only feature flag, the first response to a
V2-only incident should be to set that flag to disabled and redeploy. Classic
Gulera must remain independently reachable at `/admin`. The exact flag name and
deployment procedure will be added during Phase 2; no flag exists yet.

## Database rule

Phase 1 creates no migration and changes no database object. Therefore a normal
Phase 1 application rollback requires no database action.

For any later approved additive migration, use a reviewed forward-only
corrective migration whenever possible. Never run a production reset. Restore a
Supabase daily backup or PITR point only for a confirmed data-loss/corruption
event, with an explicit recovery time objective, owner approval, and planned
downtime. Supabase notes that a project is inaccessible during restoration and
that Storage objects are not included in database backups; see
<https://supabase.com/docs/guides/platform/backups>.

## Post-rollback checks

1. Confirm Vercel reports the intended deployment as Production and Current.
2. Confirm `/`, `/login`, `/admin`, `/owner/login`, `/cleaner`, and `/grounds`
   load without a server error.
3. Test admin, owner, cleaner, and grounds sessions with authorized accounts.
4. Verify a user from organization A cannot read organization B data.
5. Run the production build and four existing domain tests shown above.
6. Run lint and compare its result with the Phase 1 baseline; the checkpoint is
   known to contain 3 lint errors and 395 warnings.
7. Check critical API and Supabase error logs before declaring recovery.

## What was tested on 2026-08-17

The restore tag was checked out as a detached HEAD in a disposable worktree.
The resolved SHA exactly matched the recorded production commit, the checkout
was clean, and the Classic admin, owner, cleaner, and grounds route entry files
were present. The same source passed the Next.js production build and all four
existing domain tests. The disposable worktree was then removed.

A production redeploy and a Supabase restore were intentionally not executed.
The authenticated portal checks and organization-isolation test remain pending
the authorized test sessions listed in the restore-point record.
