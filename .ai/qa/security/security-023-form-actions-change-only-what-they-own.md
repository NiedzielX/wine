---
id: security-023-form-actions-change-only-what-they-own
area: security
title: "Panel forms and body-less routes change only what they own"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts
  it: "T-35: write routes without a body and the panel's form actions ignore fields they do not read: the row they change shows only their own change, the other tenant is untouched"
---

# security-023-form-actions-change-only-what-they-own: Panel forms and body-less routes change only what they own

## Goal

A planted form field or body on a route that does not read one cannot change another column or another restaurant (threat T-35).

## Given

1. Marta, Tomasz (Halka) and Anna (Bistro owner) are signed in.

## When

1. Publish, invitation removal and a file upload get bodies or form fields naming Bistro and a version.
2. The wine switch, the pairing note, the restaurant details, the guest settings and the team role change are posted with extra fields (restaurant, status, role, author, rank, price, name).

## Then

1. Halka gets the next version number; only the removed invitation goes; the upload belongs to Halka.
2. Each changed row differs only in the columns that action owns (and its bookkeeping); a note never sets the planted status; the team member keeps status and restaurant.
3. No dish, wine, pairing, restaurant row or published version of Bistro changes.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The role change is undone in the test; everything else by the database restore.

## Test implementation

[packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts): `T-35: write routes without a body and the panel's form actions ignore fields they do not read: the row they change shows only their own change, the other tenant is untouched`
