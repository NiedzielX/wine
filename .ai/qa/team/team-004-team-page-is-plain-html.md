---
id: team-004-team-page-is-plain-html
area: team
title: "The team page is plain HTML with controls by hierarchy"
status: automated
spec:
  path: .ai/specs/2026-11-04-staff-accounts-and-roles.md
  ac: ["AC2", "AC3"]
test:
  file: packages/app/tests/e2e/team.e2e.test.ts
  it: "A15 is a plain HTML page for the owner: every member, a role form and a remove-access form per person, none for themselves"
---

# team-004-team-page-is-plain-html: The team page is plain HTML with controls by hierarchy

## Goal

The team page lists every member as a server-rendered page with forms (no script needed), and shows only the controls the hierarchy allows.

## Given

1. Bistro E2E has its owner, a general manager and a Wine Director.
2. The owner, the manager and the Wine Director are signed in.

## When

1. The owner opens the team page.
2. The manager opens the team page.
3. The Wine Director opens the dashboard.

## Then

1. All three people are listed with name and e-mail.
2. The owner's own row has no remove-access button and says they cannot change themselves; the manager's row has a role field and a remove-access button; no row uses a click handler.
3. For the manager the owner's row has no role field and says only an owner can change an owner.
4. The Wine Director's sidebar has no team entry; the owner's sidebar has one.

## Edge cases covered

- Control visibility follows the hierarchy but is only a convenience: the same refusals are enforced by the service (see team-002).
- Posting the forms in a browser is not covered here (no browser in this environment); the actions are covered by unit tests.

## Data and cleanup

- Read-only.

## Test implementation

[packages/app/tests/e2e/team.e2e.test.ts](../../../packages/app/tests/e2e/team.e2e.test.ts): `A15 is a plain HTML page for the owner: every member, a role form and a remove-access form per person, none for themselves`
