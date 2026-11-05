---
id: guest-013-no-code-for-inactive-wine-404-or-synthetic-traffic
area: guest
title: "No code for inactive wine 404 or synthetic traffic"
status: automated
spec:
  path: .ai/specs/2026-10-16-recommendation-code.md
  ac: ["AC6"]
test:
  file: packages/app/tests/e2e/recommendation-code.e2e.test.ts
  it: "an inactive wine, a 404 and our synthetic traffic issue no code (AC6)"
---

# guest-013-no-code-for-inactive-wine-404-or-synthetic-traffic: No code for inactive wine 404 or synthetic traffic

## Goal

No code is issued for an inactive wine, a missing wine or the app’s own synthetic traffic.

## Given

1. A fixed guest session id; an inactive wine and an active wine of Halka.

## When

1. The guest opens the choose page for the inactive wine, for an unknown wine id, and for an active wine with the synthetic-traffic header.

## Then

1. The inactive wine page loads (200) but has no code marker.
2. The unknown wine returns 404.
3. The synthetic request loads (200) and shows the code marker "none".
4. No code row is stored for the session.

## Edge cases covered

- Inactive wine, unknown wine and marked synthetic traffic.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses a fixed session id; nothing is stored, so there is nothing to clean up.

## Test implementation

[packages/app/tests/e2e/recommendation-code.e2e.test.ts](../../../packages/app/tests/e2e/recommendation-code.e2e.test.ts): `an inactive wine, a 404 and our synthetic traffic issue no code (AC6)`
