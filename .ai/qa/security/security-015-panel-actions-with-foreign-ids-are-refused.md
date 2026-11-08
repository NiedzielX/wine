---
id: security-015-panel-actions-with-foreign-ids-are-refused
area: security
title: "Panel actions with foreign ids are refused"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-30: panel server actions with an id of another restaurant under your own slug are refused and change nothing"
---

# security-015-panel-actions-with-foreign-ids-are-refused: Panel actions with foreign ids are refused

## Goal

A form posted to a server action of the panel with an id of another restaurant under one's own slug changes nothing. (threat T-30, docs/security/threat-model.md).

## Given

1. Halka and Bistro E2E have data; their Wine Directors and managers are signed in; a manual pairing exists on each side.
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: translations of a dish and a wine, wine availability, approve and note of a pairing, correct import rows, ignore an opportunity (Halka): redirect with `saved=`.
2. The same actions, plus reject, restore, move, delete, role, add pairing, suggestion, confirm and cancel import, restore and ignore of a foreign opportunity key, team role and deactivate of a foreign member, with ids of the other restaurant.

## Then

1. Every refusal redirects with `error=` (not_found, opportunity_stale, opportunity_not_dismissed) and never `saved=`.
2. Payloads and digest (including the ignored-opportunity table) unchanged; the controls' own pairings are deleted through the action at the end.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-30: panel server actions with an id of another restaurant under your own slug are refused and change nothing`
