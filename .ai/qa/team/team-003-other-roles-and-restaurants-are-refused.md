---
id: team-003-other-roles-and-restaurants-are-refused
area: team
title: "Other roles and other restaurants are refused"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC6"]
test:
  file: packages/app/tests/e2e/team.e2e.test.ts
  it: "the team of one restaurant is closed to everyone else: a Wine Director and the manager of Halka get 403 for the list, a change and the page, and see none of its data"
---

# team-003-other-roles-and-restaurants-are-refused: Other roles and other restaurants are refused

## Goal

Nobody outside a restaurant's owners and managers can read or change its team, and a person of another restaurant is not found through one's own slug.

## Given

1. Bistro E2E has its owner, a general manager and a Wine Director; Halka has its own team.
2. Signed in: the owner of Bistro E2E, its Wine Director, and the manager of Halka.

## When

1. The Wine Director and the manager of Halka ask for the team list API, try to change a member, and open the team page of Bistro E2E.
2. The owner of Bistro E2E asks for Halka's team and tries to change a member through Halka's slug.
3. Halka's manager lists Halka's team.
4. The owner of Bistro E2E changes a member of Halka through the slug of Bistro E2E.

## Then

1. Every answer to the first step is 403 and the body contains none of Bistro E2E's e-mail addresses.
2. The second step is 403 and the body contains none of Halka's people.
3. Halka's team lists Halka's people and no one from Bistro E2E.
4. The last step answers 404, and the member of Halka is unchanged.

## Edge cases covered

- Reading another restaurant's scope and changing it are both covered (list, change, page).
- A member id from another restaurant is "not found", not an error.

## Data and cleanup

- Read-only apart from the refused changes; nothing is changed.

## Test implementation

[packages/app/tests/e2e/team.e2e.test.ts](../../../packages/app/tests/e2e/team.e2e.test.ts): `the team of one restaurant is closed to everyone else: a Wine Director and the manager of Halka get 403 for the list, a change and the page, and see none of its data`
