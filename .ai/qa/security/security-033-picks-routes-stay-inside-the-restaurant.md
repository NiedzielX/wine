---
id: security-033-picks-routes-stay-inside-the-restaurant
area: security
title: "Picks routes stay inside the restaurant"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC10", "AC11"]
test:
  file: packages/app/tests/e2e/access-boundaries-picks.e2e.test.ts
  it: "T-39: both restaurants mark their own wines; another slug, another restaurant's wine id, a role without picks.edit and a stray field are refused, and no table or payload changes"
---

# security-033-picks-routes-stay-inside-the-restaurant: Picks routes stay inside the restaurant

## Goal

The picks work for the own restaurant and are closed to the other one, to the Wine Director for writing, and as a way to find out about another restaurant's wines.

## Given

1. Two restaurants (Halka and Bistro E2E), each with wines and dishes; the General Manager of Halka, the Wine Director of Halka, the owner of Bistro and the Wine Director of Bistro are signed in.

## When

1. The General Manager of Halka and the owner of Bistro each mark one wine of their own restaurant; all four accounts read the set and the simulation of their own restaurant.
2. Each side tries the other's slug (read, simulation, mark, unmark), the other restaurant's wine id under its own slug, a mark and an unmark as a Wine Director, a body with a field outside the schema, a request without the CSRF token and one without a session.
3. The owner of Bistro asks the simulation about a Halka wine id and about an id that does not exist.

## Then

1. Own marks answer 200 and every own read answers 200 with exactly the one marked wine.
2. A foreign slug answers 403 without any name of the other side's wines; a foreign wine id under an own slug answers 404 with the same body as an unknown id; a Wine Director answers 403 `forbidden`; a stray field answers 422; no CSRF token answers 403 and no session 401.
3. The simulation answers a foreign id exactly as an unknown one (`name` empty, reason `not_in_list`) and never names a Halka wine.
4. Every payload (sets and simulations of both restaurants) and the digest of every table, `restaurant_pick` and `pick_edit` included, are exactly as before the refused attempts; each restaurant still has only its own pick and there are two history rows.

## Edge cases covered

- An id that is not a UUID is the same 404; a pick of the own restaurant listed together with a foreign id in one simulation names only the own wine.
- Mutations (run once, recorded in the run log): the restaurant filter removed from the wine lookup of the repository and the route's permission weakened to `panel.view` each turn the test red.

## Data and cleanup

- Snapshot of the whole database before, restored after; two wines and a dish of Bistro are cloned from Halka's inside the test.

## Test implementation

[packages/app/tests/e2e/access-boundaries-picks.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-picks.e2e.test.ts): `T-39: both restaurants mark their own wines; another slug, another restaurant's wine id, a role without picks.edit and a stray field are refused, and no table or payload changes`
