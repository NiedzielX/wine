---
id: admin-016-demo-sign-in-refusals-and-shared-lock
area: admin
title: "Demo sign-in refusals and the shared account lock"
status: automated
spec:
  path: .ai/specs/2026-11-16-interactive-demo-entry.md
  ac: ["AC1", "AC3"]
test:
  file: packages/app/tests/e2e/demo-entry.e2e.test.ts
  it: "a waiter, an unknown key and a planted e-mail or password get no session; a wrong password in the ordinary form still counts, and after 5 the lock refuses the button too"
---

# admin-016-demo-sign-in-refusals-and-shared-lock: Demo sign-in refusals and the shared account lock

## Goal

"Sign in as …" opens only the two dashboard accounts, ignores anything else in the form, and obeys the same account lock as the ordinary form.

## Given

1. The PostgreSQL demo instance with the flag, after `db:seed`.

## When

1. The action is called by its id with the key of a waiter, an unknown key and an empty key, each with Tomasz's e-mail and the demo password planted.
2. It is called with Marta's key and Tomasz's e-mail planted.
3. Five wrong passwords are sent for Marta through the ordinary form, then the button for Marta, then for Tomasz.

## Then

1. The waiter, unknown and empty keys go back to the sign-in page with the generic error and set no session.
2. The session of the Marta key belongs to Marta, not to the planted e-mail.
3. Each wrong password goes back with the generic error; after five, Marta's button is refused with the same generic answer and no session.
4. Tomasz still signs in: the lock is per account.

## Edge cases covered

- Only the lock of 5 attempts is exercised; the 15 minutes are in the unit tests of the lock.

## Data and cleanup

- The test resets Marta's failed-attempt counter at the end; the database is restored.

## Test implementation

[packages/app/tests/e2e/demo-entry.e2e.test.ts](../../../packages/app/tests/e2e/demo-entry.e2e.test.ts): `a waiter, an unknown key and a planted e-mail or password get no session; a wrong password in the ordinary form still counts, and after 5 the lock refuses the button too`
