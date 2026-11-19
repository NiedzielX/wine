---
id: admin-021-picks-set-needs-version-and-roles
area: admin
title: "Marking picks needs the version of the set and the right role"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC5", "AC10"]
test:
  file: packages/app/tests/e2e/picks.e2e.test.ts
  it: "the General Manager marks wines with the version of the set; a missing version is 428, a stale one 409, the sixth pick 422, and the Wine Director reads but is refused"
---

# admin-021-picks-set-needs-version-and-roles: Marking picks needs the version of the set and the right role

## Goal

The General Manager marks and unmarks wines as the restaurant's picks; a stale or missing version, a sixth pick and the Wine Director's write are refused and change nothing.

## Given

1. The General Manager and the Wine Director of Halka are signed in; Halka has no picks.

## When

1. The General Manager reads the set (version in `ETag`), sends a mark without a version and with a malformed one, then with the version.
2. The same stale version is used for a second mark; a marked wine is marked again; four more wines are marked and a sixth is tried.
3. The Wine Director reads the set and the simulation and tries to unmark a wine; the General Manager unmarks all five.

## Then

1. Without a version 428, malformed 400, with it 200 and one pick; the stale version answers 409 `version_conflict` and the set stays as the first save left it.
2. Marking a marked wine answers `changed: false` and writes no history row; the sixth pick answers 422 `too_many_picks`, five stay.
3. The Wine Director sees five picks marked by the General Manager, none published, and gets 403 on the unmark; five history rows carry the General Manager's name.
4. After the unmarking the set is empty.

## Edge cases covered

- The idempotent request leaves exactly one history row.

## Data and cleanup

- Snapshot of the whole database before, restored after.

## Test implementation

[packages/app/tests/e2e/picks.e2e.test.ts](../../../packages/app/tests/e2e/picks.e2e.test.ts): `the General Manager marks wines with the version of the set; a missing version is 428, a stale one 409, the sixth pick 422, and the Wine Director reads but is refused`
