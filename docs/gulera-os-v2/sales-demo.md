# Gulera OS sales demo

## Purpose

The public `/demo` route gives prospective short-term-rental owners a guided,
five-step product tour from the existing login screen. It demonstrates a daily
briefing, property setup, turnover coordination, team access, and owner reporting.

## Safety boundary

- All people, activity, and property information is fictional.
- The route does not authenticate or represent a real Supabase account.
- It does not fetch, persist, mutate, message, assign, charge, or approve anything.
- It imports no Supabase client and reads no environment variable.
- The interface labels itself `Fictional data`, `No login`, and `Read-only`.
- Real login behavior and the protected Classic and V2 workspaces are unchanged.

This is intentionally a simulated sales workspace instead of a shared demo
credential. A real multi-user sandbox can be considered later with explicit data
isolation, reset, abuse prevention, and database-backup approval.

## Routes

- `/login` contains the demo entry point.
- `/demo` contains the interactive walkthrough.
- `/demo` links back to `/login` at all times.

## Verification

Run `npm run test:demo-isolation` to verify the route remains detached from auth,
network requests, and persistence. The normal production build validates the route
against the installed Next.js version.
