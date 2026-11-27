---
id: security-037-dish-visibility-stays-inside-the-restaurant
area: security
title: "Dish visibility stays inside the restaurant"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC15"]
test:
  file: packages/app/tests/e2e/catalog-visibility.e2e.test.ts
  it: "T-41: both accounts may hide and show their own dish; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found"
---

# security-037-dish-visibility-stays-inside-the-restaurant: Dish visibility stays inside the restaurant

## Goal

Hiding and showing a dish works for the own restaurant and is closed to the other one, to callers without a session and to forged requests.

## Given

1. The Wine Director of Halka, the owner and the Wine Director of Bistro E2E; a published dish in both restaurants.

## When

1. Each account hides and shows a dish of its own restaurant.
2. Each tries to read and change the other restaurant's dish by slug, and its own slug with the other's id; calls without a session, without the CSRF header, with a foreign Origin; a waiter signs in; the panel's own action is posted by the other restaurant and without a session.

## Then

1. All own-restaurant changes answer 200.
2. Every foreign slug answers 403; a foreign id under the own slug answers 404 with the very body of an id that does not exist; no session 401; no CSRF header or foreign Origin 403; the waiter cannot sign in.
3. No refused action reports a save.
4. Both public menus, the visibility of every dish of both restaurants and every table digest are exactly as before the refused attempts.

## Edge cases covered

- The unit tests assert the permission table (the waiter has no `catalog.edit`) because a waiter has no session to try with.

## Data and cleanup

- Snapshot of the database before, restored after; one Bistro dish is released directly in the database first (its dishes are drafts until it publishes).

## Test implementation

[packages/app/tests/e2e/catalog-visibility.e2e.test.ts](../../../packages/app/tests/e2e/catalog-visibility.e2e.test.ts): `T-41: both accounts may hide and show their own dish; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found`
