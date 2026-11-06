---
id: team-001-owner-removes-manager-access-at-once
area: team
title: "Owner removes a manager's access at once and restores it"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC2", "AC4"]
test:
  file: packages/app/tests/e2e/team.e2e.test.ts
  it: "an owner removes a manager's access: the manager's open session loses the dashboard and the API at once, and gets them back on reactivation"
---

# team-001-owner-removes-manager-access-at-once: Owner removes a manager's access at once and restores it

## Goal

An owner of a restaurant removes a manager's access and the manager's open session stops working on the next request, with no new sign-in; restoring access brings it back.

## Given

1. Bistro E2E has its owner, a general manager (Marek) and a Wine Director (Sonia).
2. Marek is signed in; his session reads the pairings API and the dashboard (both 200).
3. The owner is signed in and reads the team with the version of each person.

## When

1. The owner removes Marek's access with his current version.
2. Marek, with the same session cookie, asks for the pairings API, the team API and the dashboard.
3. Marek signs in again.
4. The owner restores Marek's access with the new version.

## Then

1. The removal answers 200; Marek is `deactivated` and his version rises from 1 to 2.
2. Marek's same session now gets 403 from the pairings API, the team API and the dashboard.
3. A new sign-in is refused with 403 and the code `no_panel_access`.
4. After restoring, the same session gets 200 again from the pairings API and the dashboard, and Marek is `active` at version 3.

## Edge cases covered

- The session is not deleted by the change: access follows the membership, not the cookie.
- Version numbers rise with each change (optimistic locking).

## Data and cleanup

- Works on the shared e2e database; the test puts Marek back to active before it ends.

## Test implementation

[packages/app/tests/e2e/team.e2e.test.ts](../../../packages/app/tests/e2e/team.e2e.test.ts): `an owner removes a manager's access: the manager's open session loses the dashboard and the API at once, and gets them back on reactivation`
