---
id: security-038-adding-a-dish-or-wine-stays-inside-the-restaurant
area: security
title: "Adding a dish or wine stays inside the restaurant"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC19"]
test:
  file: packages/app/tests/e2e/catalog-create.e2e.test.ts
  it: "T-42: both accounts may add to their own restaurant; refused attempts by the other restaurant, without a session or a token leave every table and payload as it was"
---

# security-038-adding-a-dish-or-wine-stays-inside-the-restaurant: Adding a dish or wine stays inside the restaurant

## Goal

The routes, forms and pages that add a dish or a wine work for the own restaurant and are closed to the other one, to callers without a session and to forged requests.

## Given

1. The Wine Director of Halka, the owner and the Wine Director of Bistro E2E; menus and wine lists in both restaurants.

## When

1. Each account adds a dish and a wine to its own restaurant; the Bistro owner adds a dish with the name of one of Halka's.
2. Each tries to add to the other restaurant by slug; calls without a session, without the CSRF header, with a foreign Origin; a waiter signs in; the panel's own actions and the A32 pages are tried by the other restaurant and without a session.

## Then

1. All own-restaurant additions answer 201, and the same name in the other restaurant is no duplicate.
2. Every foreign slug answers 403; no session 401; no CSRF header or foreign Origin 403; the waiter cannot sign in; the A32 pages answer 403 or 404 with no form.
3. No refused action reports a save.
4. Both public menus, the details of every dish and wine of both restaurants and every table digest are exactly as before the refused attempts.

## Edge cases covered

- The unit tests assert the permission table (the waiter has no `catalog.edit`) because a waiter has no session to try with.

## Data and cleanup

- Snapshot of the database before, restored after; the publish in the scenario is part of it.

## Test implementation

[packages/app/tests/e2e/catalog-create.e2e.test.ts](../../../packages/app/tests/e2e/catalog-create.e2e.test.ts): `T-42: both accounts may add to their own restaurant; refused attempts by the other restaurant, without a session or a token leave every table and payload as it was`
