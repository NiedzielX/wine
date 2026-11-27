---
id: admin-035-picks-screen-for-the-two-roles
area: admin
title: "Restaurant’s picks screen: the manager changes, the Wine Director only looks"
status: automated
spec:
  path: .ai/specs/implemented/2026-11-18-restaurant-picks.md
  ac: ["AC10", "AC17"]
test:
  file: packages/app/tests/e2e/picks-panel.e2e.test.ts
  it: "the General Manager gets the screen with working switches and the navigation entry; the Wine Director gets it with every switch disabled and a notice; no session and another restaurant’s owner get no data"
---

# admin-035-picks-screen-for-the-two-roles: Restaurant’s picks screen: the manager changes, the Wine Director only looks

## Goal

The General Manager opens “Restaurant’s picks” from the navigation and can use every switch; the Wine Director sees the same screen and the simulator with every switch disabled and a notice; nobody else gets in.

## Given

1. The General Manager and the Wine Director of Halka are signed in; Halka has no picks.
2. The owner of another restaurant is signed in.

## When

1. The General Manager opens the screen.
2. The Wine Director opens it.
3. A visitor with no session opens it; the other restaurant’s owner opens it under Halka’s address.

## Then

1. The page is titled “Restaurant’s picks”, is linked from the navigation, says “0 of 5 wines are marked”, and every wine that guests can see has an enabled “Mark as pick” switch; the page has no “AI”.
2. The Wine Director gets “View only” and “Only the owner and the general manager change the picks.”, every switch is disabled, and the “Before and after” simulator is there.
3. The visitor is sent to the sign-in page; the other restaurant’s owner gets no page (refusal or redirect) and no Halka wine name.

## Edge cases covered

- A wine hidden from guests has its switch disabled for every role.

## Data and cleanup

- Snapshot of the whole database before, restored after; the set of picks is emptied first.

## Test implementation

[packages/app/tests/e2e/picks-panel.e2e.test.ts](../../../packages/app/tests/e2e/picks-panel.e2e.test.ts): `the General Manager gets the screen with working switches and the navigation entry; the Wine Director gets it with every switch disabled and a notice; no session and another restaurant’s owner get no data`
