---
id: security-018-guests-see-only-the-published-state
area: security
title: "Guests see only the published state"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts
  it: "T-33: unpublished decisions, notes and translations reach no guest page and no public API: whole payloads are byte-identical until publish, and match the published snapshot"
---

# security-018-guests-see-only-the-published-state: Guests see only the published state

## Goal

An unpublished pairing decision, note or translation, and the note of a rejected or of an unreviewed pairing, never reach a guest page or the public API (threat T-33).

## Given

1. Halka and Bistro E2E are published; Bistro E2E has the sample wine list and menu with approved pairings.
2. Marta (Wine Director) and Tomasz (manager) of Halka are signed in.

## When

1. Every guest surface of Halka is read twice: landing, menu (Polish and English), the wines of four dishes (both languages), a wine page, the table form and result, How it works, the waiter view and its table, the public menu, the recommendations of each dish and the table API.
2. Marta adds a note to a published pick, rejects another one with a note and approves a suggestion with a note; a suggestion that stays unreviewed gets a stored note; Tomasz saves an English dish name.
3. Every surface is read again; then Marta publishes and they are read once more.

## Then

1. The two reads before the changes are equal, so the comparison is meaningful.
2. After the unpublished changes every answer is byte-identical to the one before, and none of the new texts appears anywhere.
3. Every sommelier pick of the public API is an approved pairing of the latest published snapshot in the database; the suggestion approved after the publish is not a pick yet.
4. After publishing, the new note, the approval and the English name appear (positive control); the notes of the rejected and of the unreviewed pairing still appear nowhere.

## Edge cases covered

- A note on a suggestion through the panel turns it into a decision (`modified`) by design, so the unreviewed note is written straight into the database.
- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The file records the whole database first and puts it back in `afterAll`.

## Test implementation

[packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-guest.e2e.test.ts): `T-33: unpublished decisions, notes and translations reach no guest page and no public API: whole payloads are byte-identical until publish, and match the published snapshot`
