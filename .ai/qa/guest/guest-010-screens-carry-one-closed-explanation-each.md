---
id: guest-010-screens-carry-one-closed-explanation-each
area: guest
title: "Screens carry one closed explanation each"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
  ac: ["AC2","AC11","R10"]
test:
  file: packages/app/tests/e2e/how-it-works.e2e.test.ts
  it: "G1, G5, G6 and G9: exactly one explanation each, closed, never inside a link"
---

# guest-010-screens-carry-one-closed-explanation-each: Screens carry one closed explanation each

## Goal

The menu, whole-table form, table result and staff screen each show exactly one closed explanation that is never inside a link, and the table result explanation opens without a script.

## Given

1. A script-free browser; three dishes (Beef tartare, Wild mushroom risotto, Duck breast) chosen for the table.

## When

1. The guest opens the menu, the whole-table form, the table result and the staff lookup screen.
2. On the table result the guest taps the explanation.

## Then

1. Each of the four screens has exactly one explanation and it is closed.
2. No explanation is inside a link, button or paragraph.
3. After the tap the table result explanation says "we also suggest a glass for each dish" and the page still shows "Works with".
4. The wine card header on the table result carries no seal icon.

## Edge cases covered

- Four screens checked in one case: menu, table form, table result, staff lookup.
- No seal in the card header (AC11).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- The dish list is read once from the public menu API.

## Test implementation

[packages/app/tests/e2e/how-it-works.e2e.test.ts](../../../packages/app/tests/e2e/how-it-works.e2e.test.ts): `G1, G5, G6 and G9: exactly one explanation each, closed, never inside a link`

**Notes for the reviewer:** The test loops over four screens inside one `it`; it is treated here as one case (one explanation per screen).
