---
id: admin-005-pairings-page-has-two-explanations
area: admin
title: "Pairings page has two explanations"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "A6 has two closed explanations, one per card; a tap opens each (spec 2026-10-16-how-it-works-explanations, phase 3)"
---

# admin-005-pairings-page-has-two-explanations: Pairings page has two explanations

## Goal

The pairings page (A6) shows two closed explanations, one per card, and a tap opens each.

## Given

1. The sommelier is signed in.

## When

1. The sommelier opens the Pairings page.
2. The sommelier taps the pairings explanation, then the suggestions explanation.

## Then

1. The page has exactly two explanations and none of them is open.
2. After the first tap that explanation is open and says "Guests see at most 4 wines." and "A rejected pairing never appears with this dish."
3. After the second tap that explanation is open and mentions "Recommended for your dish" and "never as your pairing".

## Edge cases covered

- Explanations start closed; each opens independently.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `A6 has two closed explanations, one per card; a tap opens each (spec 2026-10-16-how-it-works-explanations, phase 3)`
