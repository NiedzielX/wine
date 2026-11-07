---
id: showcase-011-demo-refuses-signin-action-and-invitation
area: showcase
title: "The built demo refuses the sign-in form action and an invitation"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC13"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "refuses the sign-in form action and an invitation in a built demo instance, and sets no session"
---

# showcase-011-demo-refuses-signin-action-and-invitation: The built demo refuses the sign-in form action and an invitation

## Goal

Even a request built by hand against the built demo instance cannot open a session: not through the sign-in form action, and not through the invitation page.

## Given

1. An instance runs in demo mode (no accounts, no invitations).

## When

1. Send the sign-in form action (the way a browser without JavaScript posts a form) with the published demo e-mail and password.
2. Send the invitation form action with a made-up token, name and password, and open the invitation page with that token.
3. Try to sign in through the API with the e-mail used in step 2.

## Then

1. The action answers 303 back to the sign-in page with the error `showcase_read_only` and sets no cookie.
2. The invitation action does not fail with a server error and sets no cookie; the invitation page has no password field.
3. The API answers 403: no account was created.

## Edge cases covered

- The action is sent with the id taken from the build's own manifest, because the demo sign-in page renders no form.

## Data and cleanup

- Nothing is written; the instance is started by the test and stopped at the end.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `refuses the sign-in form action and an invitation in a built demo instance, and sets no session`
