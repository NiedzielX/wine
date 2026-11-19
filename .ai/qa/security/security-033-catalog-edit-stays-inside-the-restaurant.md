---
id: security-033-catalog-edit-stays-inside-the-restaurant
area: security
title: "Catalog edit stays inside the restaurant"
status: automated
spec:
  path: .ai/specs/2026-11-16-catalog-field-editing.md
  ac: ["AC10"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "T-39: both accounts may edit their own restaurant; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found"
---

# security-033-catalog-edit-stays-inside-the-restaurant: Catalog edit stays inside the restaurant

## Goal

The dish and wine edit routes and forms work for the own restaurant and are closed to the other one, to callers without a session and to forged requests.

## Given

1. The Wine Director of Halka, the owner and the Wine Director of Bistro E2E; objects in both restaurants.

## When

1. Each account reads and saves a dish or wine of its own restaurant.
2. Each tries to read and save the other restaurant's objects by slug, and its own slug with the other's id; calls without a session, without the CSRF header, with a foreign Origin; a waiter signs in; the panel's own actions are posted by the other restaurant and without a session.

## Then

1. All own-restaurant saves answer 200.
2. Every foreign slug answers 403; a foreign id under the own slug answers 404 with the very body of an id that does not exist; no session 401; no CSRF header or foreign Origin 403; the waiter cannot sign in.
3. No refused action reports a save.
4. The details of every dish and wine of both restaurants, both public menus and every table digest are exactly as before the refused attempts.

## Edge cases covered

- The unit tests assert the permission table (the waiter has no `catalog.edit`) because a waiter has no session to try with.

## Data and cleanup

- Snapshot of the database before, restored after; the Bistro menu and wine list are imported first when empty.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `T-39: both accounts may edit their own restaurant; refused reads and writes by the other restaurant, without a session or a token leave every table and payload as it was, and a foreign id is not found`
