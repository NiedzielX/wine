---
id: admin-023-two-cards-the-second-save-is-a-conflict
area: admin
title: "Wine form: the second of two open cards gets a conflict"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-16-catalog-field-editing.md
  ac: ["AC9"]
test:
  file: packages/app/tests/e2e/catalog-edit.e2e.test.ts
  it: "two cards with the same wine: the first saves, the second is told someone changed it in the meantime, and the first one's values stay"
---

# admin-023-two-cards-the-second-save-is-a-conflict: Wine form: the second of two open cards gets a conflict

## Goal

Two people with the same wine open save in turn: the second does not overwrite the first.

## Given

1. The Wine Director and the General Manager of Halka both opened the wine page.

## When

1. The Wine Director saves a new region.
2. The General Manager then saves another region from the card she opened before.
3. After reloading, the General Manager saves it again.

## Then

1. The first save redirects with the saved message.
2. The second answers with the form, the message that someone changed the wine in the meantime and her typed region; the stored region is the first one.
3. After the reload the second save succeeds; both authors are in the audit trail.

## Edge cases covered

- A change of availability or translations in between would not cause the conflict (the fingerprint covers the editable fields only).

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/catalog-edit.e2e.test.ts](../../../packages/app/tests/e2e/catalog-edit.e2e.test.ts): `two cards with the same wine: the first saves, the second is told someone changed it in the meantime, and the first one's values stay`
