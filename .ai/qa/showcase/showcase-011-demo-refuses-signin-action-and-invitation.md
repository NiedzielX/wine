---
id: showcase-011-demo-refuses-signin-action-and-invitation
area: showcase
title: "The built demo refuses the sign-in form action, the invitation action and dashboard writes"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC13"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "refuses the sign-in form action, the invitation action and dashboard writes in a built demo instance, and sets no session"
---

# showcase-011-demo-refuses-signin-action-and-invitation: The built demo refuses the sign-in form action, the invitation action and dashboard writes

## Goal

A request built by hand against the built demo instance cannot sign in, accept an invitation or write through the dashboard API.

## Given

1. An instance runs in demo mode (no accounts, no invitations).

## When

1. Send the sign-in form action (the way a browser without JavaScript posts a form) with the published demo e-mail and password.
2. Send the invitation form action with a made-up token, name and password.
3. Send a dashboard write (create an invitation) to the API without a session.
4. Open the invitation page with a made-up token.

## Then

1. The sign-in action answers 303 back to the sign-in page with the error `showcase_read_only` and sets no cookie.
2. The invitation action answers 303 to the same refusal and sets no cookie.
3. The API answers 403 with the code `showcase_read_only` (before it asks for a session).
4. The invitation page has no password field.

## Edge cases covered

- The action is sent with the id taken from the build's own manifest, because the demo sign-in page renders no form.
- Not proven here: that a REAL invitation cannot be accepted and that nothing is created. No invitation can be made on a demo instance, so that is proven by the unit test `showcase-demo.test.ts` (a real invitation, no account created, the invitation stays pending).

## Data and cleanup

- Nothing is written; the instance is started by the test and stopped at the end.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `refuses the sign-in form action, the invitation action and dashboard writes in a built demo instance, and sets no session`
