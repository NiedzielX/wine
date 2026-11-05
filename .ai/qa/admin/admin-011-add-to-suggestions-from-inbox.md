---
id: admin-011-add-to-suggestions-from-inbox
area: admin
title: "Add to suggestions from inbox"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: ["AC7","AC8"]
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "\"Add to suggestions\" from A14 stays on A14 with the message"
---

# admin-011-add-to-suggestions-from-inbox: Add to suggestions from inbox

## Goal

The "Add to suggestions" button in the opportunities inbox keeps the sommelier in the inbox with a message.

## Given

1. The sommelier is signed in without JavaScript.
2. The inbox lists a wine unpaired or glass match unpaired opportunity.

## When

1. The sommelier presses "Add to suggestions" on that opportunity in the inbox.

## Then

1. The browser stays on the opportunities page with the confirmation address (saved=suggestion_added).
2. The pairing for that dish and wine exists with status "suggested".

## Edge cases covered

- Stays on the inbox instead of moving to the dish page.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- Creates one suggested pairing; the undo step rejects it after the file.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `"Add to suggestions" from A14 stays on A14 with the message`

**Notes for the reviewer:** The test checks the address and the stored status, not the text of the message.
