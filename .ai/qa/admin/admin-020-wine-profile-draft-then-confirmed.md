---
id: admin-020-wine-profile-draft-then-confirmed
area: admin
title: "Wine profile: draft, then confirmed"
status: automated
spec:
  path: .ai/specs/2026-11-04-panel-completion.md
  ac: ["AC9", "AC11", "AC13", "AC15"]
test:
  file: packages/app/tests/e2e/profile-editing.e2e.test.ts
  it: "A5: a wine profile saved as a draft and then confirmed; the preview lists the dishes of the menu and the API preview gives the same numbers"
---

# admin-020-wine-profile-draft-then-confirmed: Wine profile: draft, then confirmed

## Goal

A wine profile is previewed against the dishes, saved as a draft (visible on the publish checklist) and then confirmed.

## Given

1. Signed in as the Wine Director; an active wine.

## When

1. Open the wine page A5 with changed body, tannin and alcohol in the URL and read the table; ask the same numbers from the preview API.
2. Save the values as a draft; open the publish screen; confirm without changes.

## Then

1. The table lists the dishes of the menu with the same before and after numbers as the API.
2. The wine is stored as a draft (grape defaults) with the new alcohol; the publish checklist says a wine profile is still a draft.
3. After the confirmation the wine is confirmed by Marta.

## Edge cases covered

- The wine's draft source falls back to grape defaults (the domain has no catalog wines yet).

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/profile-editing.e2e.test.ts](../../../packages/app/tests/e2e/profile-editing.e2e.test.ts): `A5: a wine profile saved as a draft and then confirmed; the preview lists the dishes of the menu and the API preview gives the same numbers`
