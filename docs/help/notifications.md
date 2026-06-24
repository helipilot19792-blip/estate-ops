# Notifications And Push Alerts Help

Push notifications are used for chat, Bulletin Board posts, and operational alerts when a user has enabled alerts on their device/browser.

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

## Common Notification Questions

### Does fixing chat push also fix other pushes?

Yes, the same VAPID signing setup is used by the shared staff push sender. Once the production signing key is valid, chat, Bulletin Board, and other staff push flows can use it. Individual users still need valid subscriptions.

### Why did the message send but push failed?

The chat message is saved separately from push delivery. Push can fail because the signing key is missing, the recipient has not enabled alerts, the subscription is stale, or the device/browser blocks notifications.

### Do Bulletin Board posts use the same push setup?

Yes. Bulletin Board posts use the same browser push setup as other staff notifications. A bulletin post can still exist in the portal even if push delivery fails.
