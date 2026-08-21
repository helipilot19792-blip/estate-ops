# Notifications And Push Alerts Help

Push notifications are used for chat, Bulletin Board posts, job offers and reminders, and operational alerts when a user has enabled alerts on their device/browser. Email is used for flows such as invitations, job offers, invoice delivery, and approved invoice reminders when a valid recipient and mail configuration exist.

## Required Production Environment

The live Vercel project that serves `portal.estateofmindpm.com` must have a valid server-side VAPID private key.

- Project currently serving the portal: `estate-ops-fw59`
- Preferred private key variable: `GULERA_PUSH_SIGNING`
- The value must be a VAPID private key, not a Stripe key and not a value starting with `sk_live`.
- A valid VAPID private key decodes to 32 bytes.

## Diagnostics

Use `/api/push-diagnostics` to check whether production can see the push signing key.

A healthy result shows:

- `selectedPrivateKeyName` is `GULERA_PUSH_SIGNING`
- `present` is `true`
- `decodedBytes` is `32`
- `valid` is `true`

## User Setup

Each user must enable alerts from the portal on the device and browser they actually use. If VAPID keys are rotated, existing browser subscriptions may need to be recreated by turning alerts off and back on.

## Admin Delivery Review

The admin Notifications and Jobs areas can show delivery failures, overdue offers, retry controls, and staffing exceptions. A saved chat message, bulletin post, job, or invoice can still exist even when its push or email notification fails.

- Retrying a failed notification attempts delivery again; it does not create a second job.
- An expired offer may need staffing review or reassignment rather than only a resend.
- AI Supervisor can create an admin alert when high-priority proposals are waiting for approval. The alert does not execute the proposal.
- Calendar links in supported cleaner reminders are convenience links; the portal remains the source for the current job status.

## Common Notification Questions

### Does fixing chat push also fix other pushes?

Yes, the same VAPID signing setup is used by the shared staff push sender. Once the production signing key is valid, chat, Bulletin Board, and other staff push flows can use it. Individual users still need valid subscriptions.

### Why did the message send but push failed?

The chat message is saved separately from push delivery. Push can fail because the signing key is missing, the recipient has not enabled alerts, the subscription is stale, or the device/browser blocks notifications.

### Why did a job notification fail?

Check that the staff profile is connected to the correct active cleaner or grounds account, that the account has a usable email or push subscription, and that the production email and push configuration is healthy. Use the admin notification history and retry control after correcting the cause.

### Does an AI Supervisor alert mean the action already happened?

No. It only tells admins that a high-priority supervised proposal is waiting. Open AI Copilot on Home, review the recipient, destination, content, and effects, then confirm or dismiss it.

### Do Bulletin Board posts use the same push setup?

Yes. Bulletin Board posts use the same browser push setup as other staff notifications. A bulletin post can still exist in the portal even if push delivery fails.
