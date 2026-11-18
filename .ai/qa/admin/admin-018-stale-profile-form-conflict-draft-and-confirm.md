---
id: admin-018-stale-profile-form-conflict-draft-and-confirm
area: admin
title: "Stale profile form, draft and confirm without changes"
status: automated
spec:
  path: .ai/specs/2026-11-04-panel-completion.md
  ac: ["AC8", "AC9"]
test:
  file: packages/app/tests/e2e/profile-editing.e2e.test.ts
  it: "a stale form is refused with a conflict message and changes nothing; Save as draft and Confirm without changes change only the state"
---

# admin-018-stale-profile-form-conflict-draft-and-confirm: Stale profile form, draft and confirm without changes

## Goal

Two people editing the same profile do not overwrite each other, and the state buttons change only the state.

## Given

1. Two panel users (Marta, Tomasz) open the same dish page; both forms carry the same profile version.

## When

1. Tomasz saves and confirms a changed profile.
2. Marta submits her older form.
3. Marta saves the profile as a draft, saves the same draft again, then presses "Confirm without changes".

## Then

1. Marta's save is refused with the version-conflict message; the dish row and the audit trail are exactly as Tomasz left them.
2. "Save as draft" sets the draft state with nobody recorded as confirming; the banner says "Not confirmed yet" and offers "Confirm without changes".
3. Saving the same draft again says there was nothing to change.
4. "Confirm without changes" keeps the scales and makes the profile confirmed.

## Edge cases covered

- The fingerprint covers the scales and the state, so a confirmation by someone else is a conflict too.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/profile-editing.e2e.test.ts](../../../packages/app/tests/e2e/profile-editing.e2e.test.ts): `a stale form is refused with a conflict message and changes nothing; Save as draft and Confirm without changes change only the state`
