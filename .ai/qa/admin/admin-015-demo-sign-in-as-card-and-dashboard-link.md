---
id: admin-015-demo-sign-in-as-card-and-dashboard-link
area: admin
title: "Sign in as a demo account from the card"
status: automated
spec:
  path: .ai/specs/2026-11-16-interactive-demo-entry.md
  ac: ["AC1", "AC3"]
test:
  file: packages/app/tests/e2e/demo-entry.e2e.test.ts
  it: "the card offers Marta and Tomasz, \"Sign in as Tomasz\" lands in his dashboard with a way back to /start, and neither a hash nor the password is in any page"
---

# admin-015-demo-sign-in-as-card-and-dashboard-link: Sign in as a demo account from the card

## Goal

On the interactive demo instance a visitor signs in to the dashboard with one click as a demo account, and the public password and its hash never appear in a page.

## Given

1. An instance on PostgreSQL after `db:seed` with `ALLOW_DEMO_DATA=true`; a second one on in-memory data.

## When

1. A visitor opens the sign-in page and reads the card.
2. The visitor presses "Sign in as Tomasz" (the form is posted without JavaScript) and opens the dashboard.
3. Pages of both instances are read for the password and the hash.

## Then

1. The card lists two accounts, Marta (Wine Director) and Tomasz (General Manager), and no waiter, with the demonstration-data note and the lock warning.
2. "Sign in as Tomasz" answers 303 to `/admin/halka`; the session belongs to `tomasz@halka.pl`; a session row exists.
3. The dashboard shows a link back to `/start?lang=en`.
4. Neither `scrypt$` nor the demo password is in `/start`, the sign-in page or the guest pages, in Polish and English, on both instances.

## Edge cases covered

- The hidden form fields carry only the key and the language.

## Data and cleanup

- Creates sessions in the shared database; the database is restored at the end.

## Test implementation

[packages/app/tests/e2e/demo-entry.e2e.test.ts](../../../packages/app/tests/e2e/demo-entry.e2e.test.ts): `the card offers Marta and Tomasz, "Sign in as Tomasz" lands in his dashboard with a way back to /start, and neither a hash nor the password is in any page`
