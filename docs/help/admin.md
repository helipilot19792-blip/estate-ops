# Admin Portal Help

The admin portal is the operations control center for GuleraOS / EstateOS.

## Main Areas

- Home: Daily snapshot, alerts, occupied properties, cleaning count, and quick action buttons.
- Notifications: Operational notification center and delivery status.
- Calendar: Month view of synced booking events and scheduled jobs.
- Bookings: Full synced booking list across upcoming, current, and past reservations with property filters and search.
- Chat: Conversations with owners, cleaners, grounds staff, and admins.
- Jobs: Cleaning and grounds work, staffing status, offers, active work, and exceptions.
- Maintenance Flags: Open property issues reported by staff, owners, or admins.
- Inspections: Property inspection rules and logs.
- Invoices: Owner invoices, defaults, existing invoices, payment state, and history.
- Properties: Property records, access details, SOPs, calendars, owner links, and health.
- Assignments: Cleaner and grounds routing priorities for properties.
- Documents: Document vault for operating documents.
- Backup: Export center.
- Team: Users, invites, cleaner accounts, grounds accounts, and admin access.

## Language Switching

Use the language selector to switch the portal between English, French, and Spanish. The admin navigation, workspace shell, support modal, and AI Helper are multilingual. Deeper admin sections are being translated in careful phases, so some feature-specific labels may still appear in English until their section is completed.

## AI Helper

The AI Helper opens from the admin header and answers questions about how to use GuleraOS / EstateOS. It uses the help files as its source of truth and does not inspect live customer records. For current data, open the relevant admin area such as Properties, Jobs, Invoices, Chat, Maintenance, or Notifications.

## TV View

Admins can open a TV-safe screen from the admin header. This opens a separate `/admin/tv` window designed for office TVs and shared displays.

- The TV view removes sensitive details and reduces staff names to first names only.
- It focuses on a same-screen operational snapshot such as arrivals, in-house stays, awaiting acceptance, maintenance, cleaning, and grounds.
- It is meant for display use, so it does not need the normal admin controls.
- Some cards may auto-scroll when there are more items than can fit in the visible card area.

## My Account

Signed-in users can open My Account from the top portal bar. My Account shows the signed-in email, role, and account ID. Users can update their own full name, phone number, password, and preferred language. It is available globally, including admin, owner, cleaner, grounds, and platform pages.

My Account also includes Privacy and account deletion. Users can request deletion of their account and personal information. This creates a deletion request for review; it does not instantly delete operational records. Some records may be retained where needed for legal obligations, security, billing, dispute resolution, or business records.

## Setup Order

1. Create the property.
2. Add access details and SOPs.
3. Add booking calendars.
4. Create or confirm cleaner and grounds accounts.
5. Assign cleaner and grounds accounts to properties.
6. Sync calendars and review generated work.

## Common Admin Questions

### Why is a job stranded?

A stranded job usually means the property does not have a usable staff assignment, enough staff units, or an accepted staff slot. Check the property assignment, cleaner or grounds account membership, and the job staffing status.

### Where do I add booking calendars?

Go to Properties, open the property setup area, then use the Calendars tab. Paste the full iCal or ICS URL and keep the calendar active.

### Where can I find bookings that are farther in the future?

Use the Bookings section in admin. It shows the full synced booking list, not just the next few days. You can filter by property, switch between upcoming, current, past, or all bookings, and search by guest, property, source, or date.

### Can I open bookings from the calendar?

Yes. Check-in chips in the admin calendar are clickable and open the booking note editor directly. Cleaning chips are labeled as cleaning jobs so they can be distinguished from booking events.

### Why did my guest name or guest count change back after a calendar sync?

Calendar sync can overwrite booking fields that come from the source feed if the sync logic is not preserving manual edits. If guest information looks wrong after a sync, check the booking in the Bookings section and the synced calendar source for that property.

### What does Awaiting acceptance mean?

Awaiting acceptance means a job exists but the assigned staff member has not accepted it yet. It is a staffing-response state, not a completed or active work state.

### Where do I manage push notifications?

Users enable alerts from their own portal. Admins should check the notification center, push diagnostics, and whether the user has enabled alerts on the device/browser they actually use.

### How do chat notifications work?

Chat messages are saved in the portal first. If the recipient has alerts enabled and a valid push subscription, the app attempts to send a push notification. If push fails, the chat message still exists in the portal.
