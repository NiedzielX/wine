---
id: admin-007-sign-out-ends-session
area: admin
title: "Sign out ends session"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "signing out ends the session"
---

# admin-007-sign-out-ends-session: Sign out ends session

## Goal

Signing out ends the session so the dashboard is closed again.

## Given

1. The sommelier is signed in.

## When

1. The sommelier presses "Sign out".
2. The sommelier then opens the Halka dashboard address directly.

## Then

1. After signing out the browser is on the sign-in page.
2. Opening /admin/halka sends the browser back to the sign-in page.

## Edge cases covered

- The old session is really invalid, not just hidden by the redirect after the click.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- Ends the session created earlier in the file.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `signing out ends the session`
