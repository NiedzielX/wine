---
id: restaurant-006-roles-inside-halka-manager-and-waiter
area: restaurant
title: "Roles inside Halka: manager and waiter"
status: automated
spec:
  path: .ai/specs/2026-10-25-agent-security-hardening.md
  ac: ["user A cannot reach user B's data (issue #95)"]
test:
  file: packages/app/tests/e2e/tenant-isolation.e2e.test.ts
  it: "inside Halka the manager cannot decide pairings and the waiter cannot sign in to the panel: 403"
---

# restaurant-006-roles-inside-halka-manager-and-waiter: Roles inside Halka: manager and waiter

## Goal

Inside one restaurant the role matrix holds: the manager cannot decide pairings and the waiter has no dashboard login.

## Given

1. The manager of Halka is signed in; the waiter account `kelner@halka.pl` exists.

## When

1. The manager sends `POST /api/v1/restaurants/halka/pairings/bulk-decision` (a permission of the Wine Director only).
2. The waiter tries to sign in to the panel with the correct password.

## Then

1. The manager gets 403.
2. The waiter gets 403 with the code `no_panel_access`.

## Edge cases covered

- A correct password does not give a waiter a panel session.

## Data and cleanup

- Runs against the built app on PostgreSQL with Halka and the second restaurant made by `restaurant:create` in global-setup. Plain `fetch` with the session cookie; no browser.
- The waiter sign-in creates no session.

## Test implementation

[packages/app/tests/e2e/tenant-isolation.e2e.test.ts](../../../packages/app/tests/e2e/tenant-isolation.e2e.test.ts): `inside Halka the manager cannot decide pairings and the waiter cannot sign in to the panel: 403`
