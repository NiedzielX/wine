---
id: admin-001-signed-out-visitor-sent-to-sign-in
area: admin
title: "Signed out visitor sent to sign in"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "the dashboard sends a visitor who is not signed in to the sign-in page"
---

# admin-001-signed-out-visitor-sent-to-sign-in: Signed out visitor sent to sign in

## Goal

A visitor who is not signed in cannot open the restaurant dashboard and is sent to the sign-in page.

## Given

1. The visitor has no session (new browser).

## When

1. The visitor opens the address of the Halka dashboard (/admin).

## Then

1. The browser ends up on the sign-in page (/admin/login).
2. The page shows the "Work e-mail" field label.

## Edge cases covered

- Unauthenticated access to the dashboard is redirected, not shown.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `the dashboard sends a visitor who is not signed in to the sign-in page`
