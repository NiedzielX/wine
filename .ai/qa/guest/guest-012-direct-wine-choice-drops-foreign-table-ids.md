---
id: guest-012-direct-wine-choice-drops-foreign-table-ids
area: guest
title: "Direct wine choice drops foreign table ids"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-recommendation-code.md
  ac: ["AC5"]
test:
  file: packages/app/tests/e2e/recommendation-code.e2e.test.ts
  it: "a wine without a dish is a direct choice; table ids of another restaurant or not on the menu are dropped (AC5)"
---

# guest-012-direct-wine-choice-drops-foreign-table-ids: Direct wine choice drops foreign table ids

## Goal

A wine opened without a dish is a direct choice, and table dish ids that do not belong to the menu are dropped.

## Given

1. A fixed guest session id and an active Halka wine.

## When

1. The guest opens the choose-wine page for that wine without dishes.
2. The guest opens it again with a dish id of another restaurant and a malformed id in the table parameter.

## Then

1. The first request shows a code.
2. The stored rows for the session are exactly one, with context "direct" and no dishes.

## Edge cases covered

- Foreign or malformed dish ids are ignored.
- A repeated choice in the same session does not add a second row.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses a fixed session id; the code row stays in the database.

## Test implementation

[packages/app/tests/e2e/recommendation-code.e2e.test.ts](../../../packages/app/tests/e2e/recommendation-code.e2e.test.ts): `a wine without a dish is a direct choice; table ids of another restaurant or not on the menu are dropped (AC5)`

**Notes for the reviewer:** The title says "dropped"; the test shows it by the stored row having no dishes, and by there being no second row.
