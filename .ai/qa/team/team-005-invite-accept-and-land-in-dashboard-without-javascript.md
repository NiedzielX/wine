---
id: team-005-invite-accept-and-land-in-dashboard-without-javascript
area: team
title: "Invite, accept and land in the dashboard without JavaScript"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC7", "AC9"]
test:
  file: packages/app/tests/e2e/invitations.e2e.test.ts
  it: "the whole path: invite in A15, open the link (a plain form), set a password, land in the dashboard with the invited role; the link works once and only a hash is stored (AC7, AC9)"
---

# team-005-invite-accept-and-land-in-dashboard-without-javascript: Invite, accept and land in the dashboard without JavaScript

## Goal

A person is invited in A15, opens the link, sets a password on a plain form and lands in the dashboard with the invited role; the link works once.

## Given

1. Bistro E2E has an owner (signed in).
2. The invitee has no account.

## When

1. The owner posts the invite form of A15 (no script) for a new e-mail as Wine Director.
2. The invitee opens the link twice, then posts the accept form with a name and a password.
3. The invitee opens the dashboard, the pairings API and the team page, and signs in again with the new password.
4. Anyone opens or posts the same link again.

## Then

1. The post answers with the link once, in the response itself; reloading A15 lists the invitation without it and with a cancel button.
2. The table holds a 64-character hash, a 72-hour expiry and no token; opening the page twice uses nothing up and the page says no-referrer and no-store.
3. The post redirects to the restaurant with a session cookie; the dashboard and the pairings API answer 200, the team page 403 (a Wine Director); the password works on its own and is stored as scrypt.
4. The link is then a 404 page with the one "not valid" text, the post redirects to the same error without a cookie, and nothing new is created; the application log holds neither the token nor the e-mail address.

## Edge cases covered

- Single use and the one-time display of the link.
- The token is a form field, never part of a fetched address.

## Data and cleanup

- Creates one account and membership; removed after the file runs.

## Test implementation

[packages/app/tests/e2e/invitations.e2e.test.ts](../../../packages/app/tests/e2e/invitations.e2e.test.ts): `the whole path: invite in A15, open the link (a plain form), set a password, land in the dashboard with the invited role; the link works once and only a hash is stored (AC7, AC9)`
