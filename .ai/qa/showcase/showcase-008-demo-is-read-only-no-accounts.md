---
id: showcase-008-demo-is-read-only-no-accounts
area: showcase
title: "The demo is read-only: no accounts, sign-in refused, password nowhere"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC13", "AC14"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "is read-only: no account exists, sign-in is refused with the demo password too, and the password is nowhere in a page"
---

# showcase-008-demo-is-read-only-no-accounts: The demo is read-only: no accounts, sign-in refused, password nowhere

## Goal

The public demo instance must not let anyone change the invented restaurant: the published demo accounts do not exist there and signing in is switched off.

## Given

1. An instance runs in demo mode (in-memory data, the flag that allows demo data).

## When

1. Send the sign-in request with the published demo e-mail and password.
2. Open the sign-in page, the guide, the tour and a guest page, and search each for the published password and for AI wording.
3. Open a dashboard address without a session.

## Then

1. The answer is 403 with the code `showcase_read_only`, sets no cookie, and does not repeat the password.
2. The sign-in page has a message that the demo is read-only, no password field, and a link back to the guide that carries the language, and says do not index; no page contains the published password or AI wording.
3. The dashboard address redirects to the sign-in page: there is no way to get a session.

## Edge cases covered

- The refusal comes before the body is read, so a malformed body gets the same 403 (unit test of the route).
- Not covered by this test, covered elsewhere: the sign-in form action and the invitation page in a built instance (scenario showcase-011), guest events (unit test only: the e2e demo instance keeps its data in memory and exposes no way to count events).

## Data and cleanup

- Nothing is written; the instance is started by the test and stopped at the end.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `is read-only: no account exists, sign-in is refused with the demo password too, and the password is nowhere in a page`
