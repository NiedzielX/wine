---
id: security-012-team-read-needs-team-manage-in-your-own-restaurant
area: security
title: "Team read needs team.manage in your own restaurant"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-27: team read by role: owner and manager read their own team, a Wine Director and the other restaurant get 403 and no e-mail"
---

# security-012-team-read-needs-team-manage-in-your-own-restaurant: Team read needs team.manage in your own restaurant

## Goal

Only a role with team.manage reads a restaurant's team, and only for its own restaurant. (threat T-27, docs/security/threat-model.md).

## Given

1. Bistro E2E has an owner (Anna), a manager (Marek) and a Wine Director (Sonia); Halka has a manager (Tomasz) and a Wine Director (Marta).
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: Anna, Marek and Tomasz read their own team: 200.
2. Wine Directors of both restaurants, an owner and a manager on the other slug read the team; a Wine Director changes a member's role.

## Then

1. Every refused read is 403 and the body carries no e-mail of either team; the write is 403.
2. Payloads and table digest unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-27: team read by role: owner and manager read their own team, a Wine Director and the other restaurant get 403 and no e-mail`
