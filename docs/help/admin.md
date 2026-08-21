# Admin Portal Help

The admin portal is the operations control center for Gulera OS.

## Main Areas

- Home: onboarding, Operations Alerts, Today at a glance, occupied or vacant property views, quick actions, billing notices, and the AI Copilot inbox.
- Notifications: operational alerts, items needing action, unread activity, and notification-delivery issues.
- Calendar: month view for synced booking events, check-ins, cleaning work, grounds work, filters, and staffing context.
- Bookings: searchable synced reservations across upcoming, current, past, or all bookings.
- Chat: direct or group conversations with owners, cleaners, grounds staff, and admins.
- Bulletin Board: team-wide updates shared across admins, cleaners, and grounds staff.
- Jobs: cleaning and grounds work, offers, response deadlines, staffing, progress, payouts, reliability, notification retries, and exceptions.
- Maintenance Flags: open property issues reported by staff, owners, or admins, including photos and owner visibility.
- Inspections: recurring property inspection rules, due checks, logs, notes, and supporting photos.
- Invoices: owner invoices, running invoices, quotes, statements, PDF previews, payment tracking, reminders, tax, currency, and document history.
- Properties: property records, owner links, booking calendars, access details, SOPs, checklists, vendors, guest-device content, and property health.
- Assignments: cleaner and grounds priority and coverage rules for each property.
- Documents: property document vault for operating files.
- Backup: organization export center and downloadable snapshots.
- Team: invitations, users, cleaner accounts, grounds accounts, and admin access.

## Today At A Glance

Home combines today's operational work with guest occupancy.

- Happenings shows cleaning, grounds, check-ins, checkouts, inspections, and other dated work.
- Cleaning cards can show the assigned cleaner and checklist progress.
- Properties with guests today includes continuing stays, arrivals, departures, and same-day turnovers.
- Select Show vacant to replace the occupied cards with only properties that are vacant all day or become vacant after today's checkout.
- A checkout-only property can appear as Vacant after checkout and show the configured checkout time, departing guest summary, and next synced arrival.
- A same-day turnover with another guest checking in is not treated as vacant.
- Select Show occupied to return to the guest-occupied view.

The vacancy view depends on the latest synced calendar data and the property's configured check-in and checkout times. Sync calendars if the information appears stale.

## Operations Alerts And Notifications

Operations Alerts highlights urgent or actionable work such as stranded jobs, failed notifications, maintenance flags, due inspections, release approvals, manual staffing, invoice activity, invitations, and property-health concerns. Opening an alert takes the admin to the relevant area when a direct destination is available.

Temporary dismissal hides an alert for the current period; it does not delete the underlying job, flag, inspection, or invoice.

## AI Features

The AI Helper, AI Supervisor / Copilot, turnover rescue, and Quote AI are separate tools. See `ai.md` for their capabilities, access controls, approval behavior, and limitations.

The AI Helper answers how-to questions but does not read live organization records. The AI Supervisor reviews live operational signals and presents supervised proposals. Proposed communications or record changes remain pending until an admin confirms the displayed action.

## Calendar And Bookings

Booking calendars are connected per property using an iCal or ICS feed. Sync all calendars from Home or manage individual calendar connections in Properties.

- Calendar filters can narrow busy dates and event types.
- Booking check-in items can open the booking note editor.
- Cleaning items are labelled separately from guest booking events.
- Bookings provides a longer-range directory with property, status, and text search filters.
- Admin booking notes can be marked important and appear in daily operational views.
- Manual guest names or guest counts should be checked after source-calendar updates because the external feed remains the source for synced fields.

## Jobs, Assignments, And Staffing

Cleaning and grounds jobs use property assignments, required staffing units, offer status, and response deadlines.

- Priority assignment offers work to eligible assigned staff in order.
- Training rotation can rotate eligible cleaning opportunities.
- Manual assignment leaves the cleaning job waiting for an admin to select a cleaner.
- Admins can accept or decline an eligible cleaning offer on behalf of a cleaner when operationally necessary.
- Before assigning or reassigning, the app checks active membership, property assignment, previous declines, and accepted same-day conflicts.
- Calendar staffing details can identify cleaning jobs, the assigned cleaner, and work that still needs attention.
- A cleaner release request requires admin review before future accepted work is released and rerouted.
- Notification Queue and Exceptions show failed sends, expired offers, stranded work, and retries.
- Cleaner payouts record an internal payment ledger. Payout rates are not exposed in the cleaner portal.

Awaiting acceptance means a job offer exists but the staff member has not accepted it. Stranded generally means usable assigned coverage is missing or an offer sequence can no longer advance safely.

## Properties And Operating Knowledge

Property setup can include:

- Name, address, cover image, location, and default check-in or checkout times.
- Booking calendar feeds and sync status.
- Cleaner and grounds staffing defaults, assignment mode, and required units.
- Turnover payout defaults and payment tracking.
- Access instructions, Wi-Fi, lockbox, utilities, trash information, and owner preferences.
- Cleaning checklists, SOP text, SOP photos, visual property knowledge, vendors, and operating documents.
- Owner access and guest-device welcome or local information.

Property Health summarizes setup completeness and areas needing attention. It is an operational readiness guide, not a building inspection or legal compliance certification.

## Maintenance And Inspections

Maintenance Flags track property problems, urgency, status, photos, notes, and whether owners can see the issue. Use a flag for work that needs a durable property record rather than a quick chat message.

Inspections supports recurring rules and inspection logs. Due or overdue inspections can appear in Home and Operations Alerts. Completing a log records the result and notes; it does not automatically repair a failed item.

## Invoices, Quotes, And Statements

The Invoices area supports several document kinds and workflows:

- Invoice: create, preview, save, send, remind, mark payment state, download, or void/delete when allowed.
- Running invoice: save an editable draft and add work or expenses over time before sending it.
- Quote: prepare a service proposal manually or start from an editable Quote AI draft.
- Statement: summarize saved invoice history for one selected property and date range. Draft and void invoices are excluded.

Admins can configure invoice defaults, property rates, tax lines, sender details, payment instructions, currency, and branding. PDF previews should be reviewed before sending. Owners see sent documents in their portal and can download available PDFs.

Corrected invoices should preserve a clear history. Do not silently change a sent financial document when the workflow calls for a corrected replacement.

## Communication

Use Chat for conversations with specific participants. Deleting a chat for yourself hides it from your view; it does not necessarily remove the other participant's copy.

Use Bulletin Board for team-wide updates. Bulletin Board is separate from Chat, can generate its own unread badge and push alert, and is visible to admins, cleaners, and grounds staff. Admins can delete individual posts or clear the board. Old posts are automatically removed after 30 days.

## Documents And Backup

Documents stores property-related operating files in the document vault. Link documents to the appropriate property and use clear titles and categories so staff can find them.

Backup creates downloadable organization exports. Treat exports as sensitive because they can contain operational and personal information. Backup is not a substitute for testing restore procedures or keeping required accounting records in the appropriate system.

## Team And Invitations

Create the appropriate cleaner, grounds, owner, or admin invitation and confirm the organization before sending it. Invited users should use the email address that received the invitation. Admin access should only be enabled for people who require it. AI Copilot platform, organization, and individual-admin access is controlled from the Platform area by an authorized platform administrator.

## Language Switching

Use the language selector to switch the portal between English, French, and Spanish. The admin navigation, workspace shell, support modal, and AI Helper are multilingual. Deeper admin sections are being translated in phases, so some feature-specific labels may still appear in English.

## TV View

The `/admin/tv` screen is intended for office TVs and shared displays.

- It removes sensitive details and reduces staff names to first names only.
- It focuses on arrivals, in-house stays, awaiting acceptance, maintenance, cleaning, and grounds.
- Some cards may auto-scroll when more items exist than fit on screen.

## My Account

My Account shows the signed-in email, role, and account ID. Users can update their own name, phone number, password, and preferred language.

Privacy and account deletion creates a request for review; it does not instantly delete operational records. Some records may be retained for legal obligations, security, billing, disputes, or business records.

## Billing And Trials

A new company workspace can have a time-limited trial. Billing banners show the current trial or subscription state and available checkout or billing-portal actions. Feature access and property limits depend on the organization's current plan and server-side billing state. Do not promise a price, plan entitlement, or permanent free access unless the current Pricing and billing screens confirm it.

## Recommended Setup Order

1. Create the property and confirm default check-in and checkout times.
2. Add access details, property knowledge, checklists, and SOPs.
3. Connect and sync booking calendars.
4. Create or invite cleaner and grounds accounts.
5. Assign staffing coverage and choose the assignment mode.
6. Link the owner and configure invoice defaults or rates if needed.
7. Review generated bookings, jobs, occupancy, vacancy, and alerts.
8. Enable user notifications on the devices that will receive them.

## Common Admin Questions

### Why is a job stranded?

A stranded job usually means the property does not have usable assigned staff, enough required units, or an offer that can safely advance. Check assignments, account membership, prior declines, same-day conflicts, response deadlines, and notification delivery. The AI Supervisor may also propose a turnover rescue plan when enabled.

### Where do I add booking calendars?

Go to Properties, open the property setup area, and use Calendars. Paste the complete iCal or ICS URL, keep it active, then sync.

### Where can I find bookings farther in the future?

Use Bookings. It shows the full synced booking list rather than only the short Home look-ahead. Filter by property or booking status and search by guest, property, source, or date.

### Why is a property listed as vacant after checkout?

No guest is scheduled to remain that night, but a departing booking ends today. The vacancy card shows the configured checkout time and next synced arrival when available. A same-day turnover with a new arrival is excluded from the vacant list.

### What does Awaiting acceptance mean?

The job has been offered but the assigned staff member has not accepted it yet. It is not completed or actively in progress.

### Why did a guest name or count change after sync?

The external calendar can update fields supplied by the source feed. Review the booking in Bookings and confirm the upstream calendar data.

### Where do owners see invoices?

Owners see sent invoices, quotes, and statements available to them in the Owner portal's Invoices area. Drafts are not owner-facing.

### Should I use Chat or Bulletin Board?

Use Chat for specific participants. Use Bulletin Board for an update that should reach the whole admin, cleaner, and grounds team.
