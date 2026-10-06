# An owner who cleans their own property

Gulera uses one login/profile with separate owner and staff account capabilities.
Adding cleaner access preserves the existing owner profile, owner account, property
ownership links and invoices. An owner account does not automatically grant cleaning
access; an explicit cleaner account membership is required.

## Set up an existing owner

1. In Team → Invites, invite the person as a **Cleaner**, using the same email as
   their owner login. Do not create another login or change their owner role manually.
2. They open the invite, sign in with their existing credentials, and accept it.
   An existing account is never overwritten by unauthenticated account creation.
3. In Assignments, assign their cleaner account to their property at the desired
   priority. The existing assignment system controls which jobs are offered to them.
4. At normal login, they can choose **Owner Portal** or **Cleaner Portal**. Both
   portals also show a switcher when the login has multiple active capabilities.
   Owner-specific sign-in links may open the Owner Portal directly; the switcher
   remains available there.
5. Review the property's existing billing/default-rate settings separately. Adding
   cleaner access or a cleaning assignment does not change billing settings or rates.

The owner lane retains owner property/invoice access. The cleaner lane shows jobs and
property instructions through existing staff account/job membership checks. Being an
owner alone grants no cleaner assignment or unrelated property access. Admins can
assign the shared-login person by their linked staff account or profile; a primary
owner role without an active, same-organization cleaner link is rejected.

## Compatibility

No new migration is needed. Existing owner_accounts, cleaner_accounts,
cleaner_account_members, grounds account links and property assignments remain the
sources of capability. Existing non-pending primary profile roles are preserved when
adding portals. Explicit admin invitations can still promote non-admin profiles, and
pending profiles are initialized by their first invitation. A non-admin invitation
cannot downgrade an admin profile or admin organization membership.

The legacy organization membership role remains a single value: a new cleaner or
grounds invitation can mark an owner as a team member for staff features, while the
owner capability remains in owner_accounts. Adding owner access to a cleaner does
not replace their team membership. Existing roles are not represented as a new
comma-separated or combined database role.

Normal portal discovery reads authenticated profile links and active accounts;
it does not infer owner access from a primary role or a matching email alone.
One accessible portal opens directly, multiple owner/cleaner/grounds capabilities
show the chooser, and existing admin landing behavior remains unchanged. Read-only
admin previews do not show the real-login switcher.

No owner or cleaner account was changed live, and no invitation was sent by this
implementation. Historical primary roles previously overwritten by old invitations
are not automatically rewritten; existing account links continue to provide access.
The existing owner portal's multi-organization account selection is outside this
change; owners linked to multiple company owner accounts may still need the separate
owner account-selector improvement.

`npm run test:owner-cleaner-portals` executes real invitation, portal-discovery and
assignment routes against an offline database boundary. It checks both invitation
orders, repeat acceptance, role preservation, active account checks, cross-tenant
assignment denial, all portal combinations, admin protection and shared UI switching.
