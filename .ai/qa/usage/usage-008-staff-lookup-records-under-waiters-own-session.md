---
id: usage-008-staff-lookup-records-under-waiters-own-session
area: usage
title: "Staff lookup records under waiters own session"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC10"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "the staff lookup records staff_lookup under the waiter's own sid, without a guest session start (AC10)"
---

# usage-008-staff-lookup-records-under-waiters-own-session: Staff lookup records under waiters own session

## Goal

A waiter’s dish lookup is recorded under the waiter’s own session, without a guest session start.

## Given

1. A guest on the Halka landing page; the "For staff" link is followed.

## When

1. The waiter opens the staff page and then selects a dish by submitting the form.

## Then

1. The "For staff" link does not carry the guest’s session id and the waiter gets a different session id.
2. The staff page loads (200).
3. Exactly one event is stored for the waiter session: a staff lookup, with the chosen dish, no wine and source "staff"; no session start.
4. The lookup lists at least one wine.
5. The first visit without a choice records nothing.

## Edge cases covered

- Staff session is separate from the guest session.
- Only an explicit choice is recorded.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `the staff lookup records staff_lookup under the waiter's own sid, without a guest session start (AC10)`
