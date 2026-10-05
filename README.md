This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

### Lint dependency security

The Next.js ESLint plugin's `fast-glob` dependency is scoped to a small adapter
in `tools/lint-glob` backed by `tinyglobby`. The plugin only uses `globSync` with
`onlyDirectories` to resolve configured root directories. The adapter preserves
absolute paths and strips directory trailing slashes. This removes
the unpatched `braces` dependency ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm))
without relaxing CI's security audit. Recheck this override when upgrading the
Next.js ESLint plugin.

### Invoice currency defaults

New installations default to CAD. Admins can select CAD or USD using the Default
invoice currency control at the top of the invoice section; changes save immediately
for that organization and apply to new invoices and quotes. Individual invoices can
still use a different currency, and existing invoice currencies and amounts remain
unchanged. Existing databases can run `supabase/set_invoice_currency_default_cad.sql`
to update column defaults without overwriting saved organization preferences.

The invoice history shows the total owed across the organization from sent, unpaid
invoices, including tax. CAD and USD balances are shown separately. Quotes, drafts,
paid invoices, void invoices, and summary statements are excluded; searching or
filtering the history does not change this organization total.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
