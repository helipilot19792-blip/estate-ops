# AI Features Help

Gulera OS has several AI-assisted features with different purposes. Do not describe them as one interchangeable assistant.

## AI Helper

The AI Helper is the small in-app question-and-answer assistant opened from the admin header. It explains how to use Gulera OS using the deployed files in `docs/help/` and the recent Helper conversation.

- It can explain setup, navigation, jobs, staffing, invoices, properties, portals, alerts, and the AI features described here.
- It receives the current page path and selected English, French, or Spanish locale.
- It does not inspect the organization's live properties, bookings, invoices, messages, or job records.
- It cannot click buttons, change records, send messages, assign staff, or approve AI Supervisor actions.
- For a question about a current record, direct the user to the relevant area of the app.

## AI Supervisor / AI Copilot

The admin Home screen contains a supervised operator inbox labelled AI Copilot or AI Actions. It reviews live operational data when AI Copilot access is enabled for the platform, organization, and admin user.

The Daily Brief can summarize items that need action now, are at risk, are waiting for a response, or are covered. The inbox may propose up to several pending actions at a time.

AI Supervisor proposals can include:

- Turnover rescue: rank eligible assigned cleaners for an uncovered cleaning job today or tomorrow. Ranking considers property assignment priority, response history, prior declines, reliability, and same-day accepted-job conflicts.
- Staffing advisory: identify evidence-backed anomalies such as expired offers, stranded work, missing escalation events, or failed notification delivery.
- Invoice reminder: prepare an overdue owner-invoice reminder.
- Cleaner follow-up: prepare a direct chat message when a cleaner response needs attention.
- Guest-registration reminder: prepare an important internal booking note when required guest details are missing.

## Approval And Safety

AI Supervisor is approval-based. A proposal shows the operation, recipient, destination, content, and expected effects before the admin confirms it. Operational records and outbound communications are not changed merely because a proposal appears.

- Approving turnover rescue rechecks eligibility, assigns the selected cleaner to the open slot, creates an offered job with a response deadline, sends the existing job-offer notifications available for that cleaner, updates staffing status, and records an audit event.
- Approving an invoice reminder sends the displayed email, updates reminder tracking, and records an invoice event.
- Approving a cleaner follow-up sends the displayed direct chat message and attempts a push notification when enabled.
- Approving a guest-registration reminder appends an important internal admin note to the booking. It does not contact the guest, owner, or cleaner.
- A staffing advisory is review-only. Acknowledging it records the review and hides the finding temporarily without changing staffing or customer records.
- Dismissing a proposal hides it for now. It does not perform the proposed operation.

High-priority Supervisor findings may generate an admin alert about approvals waiting. That alert does not approve or execute the proposed action.

If the inbox reports that AI Copilot is disabled, an authorized platform administrator must enable the platform, organization, and individual admin access controls.

## Quote AI

Quote AI is part of the invoice and quote composer. It turns the admin's service description and business context into an editable proposal draft with suggested sections and line items.

- Choose Quote in the invoice composer, enter enough service details, then request an AI proposal.
- Applying the proposal copies the draft into the quote composer.
- The admin must review names, scope, quantities, prices, taxes, dates, and terms before previewing or sending it.
- Quote AI does not automatically send a quote or guarantee that generated wording is complete for legal, tax, or contractual use.

## Common AI Questions

### Can the AI Helper tell me which property is vacant right now?

No. The Helper does not inspect live account data. Open Home and use the Occupied / Show vacant control in Today at a glance.

### Will AI Supervisor send something without my approval?

It may send an admin alert that a high-priority proposal is waiting, but the proposed operational action remains pending until an admin reviews and confirms it.

### Why do I not see AI Supervisor actions?

There may be no current findings, the inbox may be minimized, or AI Copilot access may be disabled at the platform, organization, or admin-user level. Open the supervised operator inbox on Home and select Refresh actions.

### Is an AI-generated quote ready to send immediately?

No. Treat it as a draft. Review the scope, line items, pricing, tax, dates, payment terms, and owner or customer details before previewing or sending.
