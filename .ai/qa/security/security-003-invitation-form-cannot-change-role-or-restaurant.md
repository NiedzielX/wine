---
id: security-003-invitation-form-cannot-change-role-or-restaurant
area: security
title: "Invitation form cannot change the role or the restaurant"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries.e2e.test.ts
  it: "T-03: the invitation link carries the role and the restaurant, the form cannot change them; platform flag and a second use of the link grant nothing"
---

# security-003-invitation-form-cannot-change-role-or-restaurant: Invitation form cannot change the role or the restaurant

## Goal

Whoever opens an invitation link gets exactly the role and restaurant the invitation was issued for; extra form fields and platform flag grant nothing, and the link works once. (threat T-03, docs/security/threat-model.md).

## Given

1. The owner of Bistro E2E has issued a Wine Director invitation to a new e-mail.

## When

1. The link page renders its form (positive control).
2. The form is posted with the real fields plus forged `role=owner`, `restaurant=halka`, `restaurantId` and `platform=true`.
3. The same post is repeated.

## Then

1. The new account has exactly one membership: Wine Director, active, in Bistro E2E; Halka's team does not contain it.
2. The second post redirects to the dead-link page, no table digest changes, and the link page answers 404.

## Edge cases covered

- The platform path (`inviteOwner`) has no HTTP entry today; it is covered by core tests only.

## Data and cleanup

- The account, its membership, session and token rows are deleted in `afterAll`.

## Test implementation

[packages/app/tests/e2e/access-boundaries.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries.e2e.test.ts): `T-03: the invitation link carries the role and the restaurant, the form cannot change them; platform flag and a second use of the link grant nothing`
