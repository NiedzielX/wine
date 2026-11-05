---
id: admin-010-add-to-suggestions-from-dish-page
area: admin
title: "Add to suggestions from dish page"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["AC7","AC8"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "\"Add to suggestions\" on A6 puts the wine among the engine suggestions, with no unpublished change; then Approve"
---

# admin-010-add-to-suggestions-from-dish-page: Add to suggestions from dish page

## Goal

The "Add to suggestions" button on the dish page adds an unpaired wine to that dish’s engine suggestions without creating an unpublished change, and the sommelier can then approve it.

## Given

1. The sommelier is signed in without JavaScript.
2. The inbox lists an opportunity of kind wine unpaired or glass match unpaired (the test reads its dish and wine).

## When

1. The sommelier opens that dish’s pairing page and presses "Add to suggestions" for the wine.
2. In a second session with scripts on, the sommelier opens the review queue.
3. The sommelier presses "Approve" on the new pairing.

## Then

1. The page confirms "Added to suggestions" and the pairing exists with status "suggested".
2. The new pairing has exactly two buttons (Approve and Reject).
3. The "Publish" link text in the sidebar is unchanged (no unpublished change).
4. The review queue lists the new pairing.
5. After "Approve" the pairing has status "approved".

## Edge cases covered

- No unpublished-change marker after adding a suggestion.
- The review queue (needs JavaScript) shows the new suggestion.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Creates one suggested pairing. The undo step rejects it again after the file.
- A second signed-in browser session (scripts on) is started and closed by the file.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `"Add to suggestions" on A6 puts the wine among the engine suggestions, with no unpublished change; then Approve`
