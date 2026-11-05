---
id: usage-006-unavailable-or-unknown-wine-records-no-selection
area: usage
title: "Unavailable or unknown wine records no selection"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "an inactive wine (\"no longer available\") or a wine not on the list (404) records no wine_selected (AC8)"
---

# usage-006-unavailable-or-unknown-wine-records-no-selection: Unavailable or unknown wine records no selection

## Goal

Choosing a wine that is no longer available, or a wine that is not on the list, records no selection.

## Given

1. A fixed session id and an inactive Halka wine.

## When

1. A guest opens the choose page for the inactive wine and for an unknown wine id.

## Then

1. The inactive wine page loads (200) and says "no longer available".
2. The unknown wine returns 404.
3. After a wait of one second no events exist for the session.

## Edge cases covered

- Inactive wine and unknown wine.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses a fixed session id; nothing is stored.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `an inactive wine ("no longer available") or a wine not on the list (404) records no wine_selected (AC8)`
