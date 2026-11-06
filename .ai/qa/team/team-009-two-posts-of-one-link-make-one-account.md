---
id: team-009-two-posts-of-one-link-make-one-account
area: team
title: "Two posts of one link make one account"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC24"]
test:
  file: packages/app/tests/e2e/invitations.e2e.test.ts
  it: "two posts of one link at the same moment: one account and one membership, the other post gets the dead-link answer (AC24)"
---

# team-009-two-posts-of-one-link-make-one-account: Two posts of one link make one account

## Goal

Two posts of the same accept form at the same moment give one account and one membership; the other gets the dead-link answer.

## Given

1. Bistro E2E has an owner; a pending invitation exists for a new e-mail.

## When

1. The accept form is posted twice at once.

## Then

1. Exactly one redirect goes to the restaurant, with one session cookie; the other goes to the invalid-link error; the database has one account and one membership.

## Edge cases covered

- A race on single use.

## Data and cleanup

- Creates one account and membership; removed after the file runs.

## Test implementation

[packages/app/tests/e2e/invitations.e2e.test.ts](../../../packages/app/tests/e2e/invitations.e2e.test.ts): `two posts of one link at the same moment: one account and one membership, the other post gets the dead-link answer (AC24)`
