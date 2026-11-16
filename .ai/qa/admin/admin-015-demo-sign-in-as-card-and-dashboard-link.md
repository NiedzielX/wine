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
  it: "the card offers Marta and Tomasz with their e-mail and the public password, \"Sign in as Tomasz\" lands in his dashboard with a way back to /start, and no hash is in any page"
---

# admin-015-demo-sign-in-as-card-and-dashboard-link: Sign in as a demo account from the card

## Goal

On the interactive demo instance a visitor signs in to the dashboard with one click as a demo account, and the public demo password is shown next to the buttons for copying, and the password hash never appears in a page.

## Given

1. An instance on PostgreSQL after `db:seed` with `ALLOW_DEMO_DATA=true`; a second one on in-memory data.

## When

1. A visitor opens the sign-in page and reads the card.
2. The visitor presses "Sign in as Tomasz" (the form is posted without JavaScript) and opens the dashboard.
3. Pages of both instances, and of the instance without the flag, are read for the password and the hash.

## Then

1. The card lists two accounts, Marta (Wine Director) and Tomasz (General Manager), and no waiter, each with a solid, clickable "Sign in as" button and, under it, the e-mail and the demo password as text; the demonstration-data note and the lock warning are there.
2. "Sign in as Tomasz" answers 303 to `/admin/halka`; the session belongs to `tomasz@halka.pl`; a session row exists.
3. The dashboard shows a link back to `/start?lang=en`.
4. `/start` and the sign-in page show both e-mails and the password in Polish and English on both instances; `scrypt$` is on no page; the guest pages never carry the password; the instance without the flag shows the password on no page.

## Edge cases covered

- The hidden form fields carry only the key and the language; the password is never a field value.
- Manual: the buttons look clickable (filled, pointer, focus ring) at 390 and 1440 px.

## Data and cleanup

- Creates sessions in the shared database; the database is restored at the end.

## Test implementation

[packages/app/tests/e2e/demo-entry.e2e.test.ts](../../../packages/app/tests/e2e/demo-entry.e2e.test.ts): `the card offers Marta and Tomasz with their e-mail and the public password, "Sign in as Tomasz" lands in his dashboard with a way back to /start, and no hash is in any page`
