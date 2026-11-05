---
id: kpi-002-guest-usage-sessions-and-conversion
area: kpi
title: "Guest usage sessions and conversion"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC1","AC3"]
test:
  file: packages/app/tests/e2e/kpi-usage.e2e.test.ts
  it: "AC1 + AC3: sessions, views and the conversion with N of M and the change; the waiter apart"
---

# kpi-002-guest-usage-sessions-and-conversion: Guest usage sessions and conversion

## Goal

The dashboard shows guest sessions, recommendation views and the recommendation-to-selection conversion with "n of m" and the change, with waiter lookups counted apart.

## Given

1. 40 guest sessions in the current 28-day window (14 chose a wine) and 32 in the previous window (8 chose).
2. One waiter lookup without a guest session start.

## When

1. The sommelier opens the Halka dashboard.

## Then

1. "Guest sessions" shows 40, up 25% vs previous 28 days.
2. "Dish recommendations viewed" shows 40.
3. "Recommendation → selection" shows 35.0% with the text "14 of 40 sessions · dish recommendations only".
4. The conversion is up 10.0 pp vs previous 28 days.
5. "Waiter lookups" shows 1.
6. The empty-state message is gone and there is one explanation block for usage.

## Edge cases covered

- Change versus the previous window in percent and in percentage points.
- Waiter lookups are not counted as guest sessions.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The rows are placed in the current KPI window (the app itself only records "now", which lies outside the window) and are removed at the end of the file.
- Events carry the engine version "wm-e2e-e04", used to delete them.

## Test implementation

[packages/app/tests/e2e/kpi-usage.e2e.test.ts](../../../packages/app/tests/e2e/kpi-usage.e2e.test.ts): `AC1 + AC3: sessions, views and the conversion with N of M and the change; the waiter apart`
