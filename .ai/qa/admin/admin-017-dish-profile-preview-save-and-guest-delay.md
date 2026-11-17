---
id: admin-017-dish-profile-preview-save-and-guest-delay
area: admin
title: "Dish profile: preview, save and the guest delay"
status: automated
spec:
  path: .ai/specs/2026-11-04-panel-completion.md
  ac: ["AC9", "AC10", "AC13", "AC15"]
test:
  file: packages/app/tests/e2e/profile-editing.e2e.test.ts
  it: "A3 without JavaScript: the preview shows before and after, Save and confirm confirms the profile, the unpublished counter grows and guests keep the old score until publish"
---

# admin-017-dish-profile-preview-save-and-guest-delay: Dish profile: preview, save and the guest delay

## Goal

A sommelier changes the taste profile of a dish, sees how every Match Score moves before saving, saves and confirms it, and guests keep the old scores until the next publish.

## Given

1. The PostgreSQL demo instance, signed in as the Wine Director (Marta).
2. Duck breast has a taste profile; guests see its recommendations (public API).

## When

1. Open the dish page A3 without JavaScript and read the version of the profile form.
2. Submit the scales through the preview form (a plain GET) with different intensity, fat and acidity.
3. Press "Save and confirm" (a plain POST) with those values.
4. Open the publish screen, then the dish page, then publish.

## Then

1. The page has the editor, the "Save and confirm" button and a table with "before → after, change" per wine; nothing is saved by the preview (no profile or audit row changes).
2. The saved profile equals the submitted values, is confirmed, names Marta and a time; one audit row has the before and after values and the actor.
3. The banner now says "Confirmed by Marta Wierzbicka" and the unpublished-changes counter grew by one.
4. Guests see the same recommendation scores until the publish, and different ones after it.

## Edge cases covered

- Only the dish scales are changed; prices and statuses are not.

## Data and cleanup

- Snapshot of the database before, restored after.

## Test implementation

[packages/app/tests/e2e/profile-editing.e2e.test.ts](../../../packages/app/tests/e2e/profile-editing.e2e.test.ts): `A3 without JavaScript: the preview shows before and after, Save and confirm confirms the profile, the unpublished counter grows and guests keep the old score until publish`
