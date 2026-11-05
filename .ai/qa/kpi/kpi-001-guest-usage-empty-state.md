---
id: kpi-001-guest-usage-empty-state
area: kpi
title: "Guest usage empty state"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-kpi-dashboard.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/kpi-usage.e2e.test.ts
  it: "AC2: without guest sessions in either window, the empty state with the QR code link — not zeros"
---

# kpi-001-guest-usage-empty-state: Guest usage empty state

## Goal

Without guest sessions in either window the dashboard shows an empty state with a link to the QR code, not zeros.

## Given

1. The sommelier is signed in; no guest sessions exist in the KPI windows.

## When

1. The sommelier opens the Halka dashboard.

## Then

1. The page shows "No guests have used Wine Match yet" under "Guest usage".
2. It does not show the "Guest sessions" tile.
3. It links to the QR code page (/admin/halka/qr).

## Edge cases covered

- Empty state instead of zero values.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Runs before the numbers test seeds events.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/kpi-usage.e2e.test.ts](../../../packages/app/tests/e2e/kpi-usage.e2e.test.ts): `AC2: without guest sessions in either window, the empty state with the QR code link — not zeros`
