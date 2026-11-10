---
id: security-021-foreign-ids-and-slugs-answer-like-missing-ones
area: security
title: "Another restaurant's ids and addresses answer exactly like missing ones"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts
  it: "T-34: 403 vs 404 policy: another restaurant's slug answers like a slug that does not exist, another restaurant's id like an id that does not exist (status and body), on pages, API routes and actions; 403 is kept for a role below the permission"
---

# security-021-foreign-ids-and-slugs-answer-like-missing-ones: Another restaurant's ids and addresses answer exactly like missing ones

## Goal

The answers never reveal whether another restaurant, or one of its objects, exists (policy in threat model §4, T-34).

## Given

1. Tomasz (Halka manager) and Marta (Halka Wine Director) are signed in. Bistro E2E has a dish, a wine, a pairing, an open import, an invitation and a Wine Director.

## When

1. Six panel pages, four API reads and a publish are called under Bistro's address and under an address that exists nowhere.
2. Without a session, a panel page of each address is opened.
3. Under Halka's own address, eleven pages and API calls (dish, wine, pairings pages; wine, pairing, import, invitation and member changes; the guest dish API) get Bistro's id and an id that exists nowhere.
4. Four panel actions get Bistro's id and a missing id under Halka, and Bistro's address and a missing address.
5. Marta opens Halka's team, Tomasz approves all pairings of Halka.

## Then

Everything below runs in BOTH directions (a Halka account against Bistro E2E, a Bistro E2E account against Halka), and at the end the very same calls succeed for the restaurant that owns the data (positive control for both).


1. A foreign address and a missing one get the same status (403 signed in, the same sign-in redirect without a session) and the same page or error body.
2. A foreign id and a missing id get the same 404 and the same body; actions the same "not found" or "forbidden" flash.
3. Only a role below the permission in your own restaurant gets 403 for something you know exists.
4. No refused call changes a row.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The staged import and the invitation stay until the database is put back in `afterAll`.

## Test implementation

[packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts): `T-34: 403 vs 404 policy: another restaurant's slug answers like a slug that does not exist, another restaurant's id like an id that does not exist (status and body), on pages, API routes and actions; 403 is kept for a role below the permission`
