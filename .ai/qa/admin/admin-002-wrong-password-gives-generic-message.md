---
id: admin-002-wrong-password-gives-generic-message
area: admin
title: "Wrong password gives generic message"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "a wrong password gets one generic message and no access"
---

# admin-002-wrong-password-gives-generic-message: Wrong password gives generic message

## Goal

A wrong password shows one generic message and grants no access.

## Given

1. The visitor is on the sign-in page.

## When

1. The visitor enters the sommelier e-mail marta@halka.pl with a wrong password and presses "Sign in".

## Then

1. The page stays on /admin/login with an invalid-credentials error.
2. The message says the e-mail or password is "incorrect, or the account is temporarily locked", without telling which part was wrong.

## Edge cases covered

- The error text is the same whether the account exists or is locked (generic message).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- One failed sign-in attempt is made for the demo sommelier account.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `a wrong password gets one generic message and no access`
