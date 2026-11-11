---
id: security-019-draft-and-hidden-content-is-never-served
area: security
title: "Draft and hidden dishes and a hidden wine are never served"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts
  it: "T-33: draft and hidden dishes and a hidden wine are not served (404 by id, absent from every list and the table), and no guest read changes a row"
---

# security-019-draft-and-hidden-content-is-never-served: Draft and hidden dishes and a hidden wine are never served

## Goal

A dish in draft or hidden and a wine taken off the list are invisible to guests and waiters (threat T-33).

## Given

1. Halka is published. One dish is set to hidden, one to draft; Marta hides a wine with the panel switch.
2. Their names are then changed to unique markers, so any appearance of a marker is a leak.

## When

1. Every guest and waiter surface of Halka is read for two published dishes.
2. The wines page and the recommendations API are asked for the hidden and the draft dish by id; the table API and page get both of them with and without published dishes.
3. The wine page and the "selected" page of the hidden wine are opened.

## Then

1. Every surface answers 200 and carries none of the markers.
2. The hidden and the draft dish answer 404 by id, in both languages and in the API.
3. A table of only the two unpublished dishes is refused (it needs two published dishes); with two published dishes added, the answer names neither of them.
4. The hidden wine shows only "no longer available"; no recommendation code is ever issued for it, and no guest read changes another row.

## Edge cases covered

- The waiter's table issues a recommendation code by design; that table is compared apart.
- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The file records the whole database first and puts it back in `afterAll`.

## Test implementation

[packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts): `T-33: draft and hidden dishes and a hidden wine are not served (404 by id, absent from every list and the table), and no guest read changes a row`
