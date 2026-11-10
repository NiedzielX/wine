---
id: security-020-other-restaurants-ids-are-not-served-to-guests
area: security
title: "Another restaurant's dishes and wines are not served to guests"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts
  it: "T-33: another restaurant's dish and wine ids under a slug, and an unknown slug, are 404 with none of its data; both restaurants serve their own (positive control)"
---

# security-020-other-restaurants-ids-are-not-served-to-guests: Another restaurant's dishes and wines are not served to guests

## Goal

A guest URL or API call that puts one restaurant's dish or wine id under another restaurant's address finds nothing (threat T-33).

## Given

1. Halka and Bistro E2E are both published with dishes and wines of their own (names do not overlap).

## When

1. Each restaurant's menu, dish page, wine page and dish API are read under its own address (positive control).
2. The dish page, wine page, "selected" page and dish API of each restaurant are asked with the other restaurant's ids; the table API and page get a foreign dish next to an own one; a made-up address is asked for its menu and recommendations.

## Then

1. Own reads answer 200 and show the restaurant's own dish.
2. Every crossed call answers 404 (the table: 422, it needs two dishes of this restaurant) and names nothing of the other restaurant.
3. A made-up address is 404; no row changes.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- Nothing is written.

## Test implementation

[packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts): `T-33: another restaurant's dish and wine ids under a slug, and an unknown slug, are 404 with none of its data; both restaurants serve their own (positive control)`
