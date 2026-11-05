---
id: admin-003-sommelier-signs-in
area: admin
title: "Sommelier signs in"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "the sommelier signs in and lands on the restaurant dashboard"
---

# admin-003-sommelier-signs-in: Sommelier signs in

## Goal

The sommelier signs in and lands on the restaurant dashboard.

## Given

1. The visitor is on the sign-in page.

## When

1. The visitor enters marta@halka.pl with the demo password and presses "Sign in".

## Then

1. The browser lands on the Halka dashboard (/admin/halka).
2. The page shows "Sommelier-led dishes" and the word "Dashboard".

## Edge cases covered

None beyond the case above.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- Creates a session for the demo sommelier; the following tests in the file reuse it and the last test ends it.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `the sommelier signs in and lands on the restaurant dashboard`
