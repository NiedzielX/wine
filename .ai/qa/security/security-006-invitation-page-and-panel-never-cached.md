---
id: security-006-invitation-page-and-panel-never-cached
area: security
title: "Invitation page and panel are never cached"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/security-headers.e2e.test.ts
  it: "the invitation page keeps its stricter policy and every panel page is never cached"
---

# security-006-invitation-page-and-panel-never-cached: Invitation page and panel are never cached

## Goal

The page that carries a one-time token never passes the address on and is never cached. (threat T-12, docs/security/threat-model.md).

## Given

1. The built app runs.

## When

1. The dead-link invitation page and the sign-in page are requested.

## Then

1. The invitation page has `Referrer-Policy: no-referrer`; both are `no-store`.

## Edge cases covered

- Only what the Then steps list.

## Data and cleanup

- Read-only requests.

## Test implementation

[packages/app/tests/e2e/security-headers.e2e.test.ts](../../../packages/app/tests/e2e/security-headers.e2e.test.ts): `the invitation page keeps its stricter policy and every panel page is never cached`
