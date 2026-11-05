---
id: staff-010-alternatives-are-not-prefetched
area: staff
title: "Alternatives are not prefetched"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md
  ac: ["R6","Q10"]
test:
  file: packages/app/tests/e2e/staff-table.e2e.test.ts
  it: "one code for the bottle on screen after the router had time to prefetch the links in view"
---

# staff-010-alternatives-are-not-prefetched: Alternatives are not prefetched

## Goal

With JavaScript on, the links to alternative bottles are not prefetched, so only the bottle on screen gets a code.

## Given

1. A new browser with scripts on and a new session id; four dishes chosen for the table.

## When

1. The waiter opens the whole-table answer and waits two seconds for the router to prefetch the links in view.

## Then

1. The page shows "Choose this one".
2. Exactly one code is stored for the session.

## Edge cases covered

- Prefetching does not issue codes (R6, Q10).

## Data and cleanup

- A separate browser session with scripts on is started and closed by this file. The dish list is read from the public menu API. One code row stays in the database under the new session id.

## Test implementation

[packages/app/tests/e2e/staff-table.e2e.test.ts](../../../packages/app/tests/e2e/staff-table.e2e.test.ts): `one code for the bottle on screen after the router had time to prefetch the links in view`

**Notes for the reviewer:** Cited as R6 and Q10 (requirement and question), not AC ids.
