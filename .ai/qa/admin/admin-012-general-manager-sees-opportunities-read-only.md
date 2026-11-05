---
id: admin-012-general-manager-sees-opportunities-read-only
area: admin
title: "General manager sees opportunities read only"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["R7"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "the general manager sees the opportunities without buttons (R7)"
---

# admin-012-general-manager-sees-opportunities-read-only: General manager sees opportunities read only

## Goal

The general manager sees the opportunities but has no buttons to act on them.

## Given

1. The general manager (tomasz@halka.pl) signs in.

## When

1. The general manager opens the Opportunities page.

## Then

1. The page shows "View only".
2. At least one opportunity is listed.
3. No opportunity contains a button.

## Edge cases covered

- Role check: read-only access for the general manager (requirement R7, not an AC).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- A separate browser session is started and closed for this role.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `the general manager sees the opportunities without buttons (R7)`

**Notes for the reviewer:** The test name cites R7 only; there is no AC id.
