---
id: restaurant-005-halka-manager-refused-by-other-restaurant-with-no-data
area: restaurant
title: "Halka manager refused by other restaurant with no data"
status: automated
spec:
  path: .ai/specs/2026-10-25-agent-security-hardening.md
  ac: ["user A cannot reach user B's data (issue #95)"]
test:
  file: packages/app/tests/e2e/tenant-isolation.e2e.test.ts
  it: "a manager of Halka is refused by the panel and the API of another restaurant: 403 and none of its data"
---

# restaurant-005-halka-manager-refused-by-other-restaurant-with-no-data: Halka manager refused by other restaurant with no data

## Goal

A signed-in manager of one restaurant cannot read or change another restaurant through the panel or the API, and the refusal leaks nothing about it.

## Given

1. The manager of Halka (Tomasz Lis) is signed in; the restaurant Bistro E2E exists.

## When

1. The manager requests the panel pages `/admin/bistro-e2e` and `/admin/bistro-e2e/setup`, the API `GET .../pairings` and `GET .../qr` of Bistro E2E, and sends `POST .../publish` and `POST .../pairings/bulk-decision` for it (with a valid CSRF token).

## Then

1. Every answer has HTTP status 403.
2. No body contains the restaurant name or the owner e-mail of Bistro E2E.

## Edge cases covered

- Reads and writes, pages and API.
- The opposite direction of restaurant-003 (owner of the new restaurant against Halka).

## Data and cleanup

- Runs against the built app on PostgreSQL with Halka and the second restaurant made by `restaurant:create` in global-setup. Plain `fetch` with the session cookie; no browser.

## Test implementation

[packages/app/tests/e2e/tenant-isolation.e2e.test.ts](../../../packages/app/tests/e2e/tenant-isolation.e2e.test.ts): `a manager of Halka is refused by the panel and the API of another restaurant: 403 and none of its data`
