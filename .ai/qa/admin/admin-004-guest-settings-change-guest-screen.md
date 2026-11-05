---
id: admin-004-guest-settings-change-guest-screen
area: admin
title: "Guest settings change guest screen"
status: automated
spec:
  path: none
  ac: []
test:
  file: packages/app/tests/e2e/admin.e2e.test.ts
  it: "guest settings change what G3 and its explanation say (spec 2026-10-16-how-it-works-explanations, AC8, AC9)"
---

# admin-004-guest-settings-change-guest-screen: Guest settings change guest screen

## Goal

When the restaurant switches off scores and unreviewed pairings, the guest wine screen shows no percentages and its explanation talks about the glass, not about engine picks.

## Given

1. The sommelier is signed in.

## When

1. The sommelier opens the Publish page, unchecks "showScores" and "showUnreviewed" and presses "Save settings".
2. A guest then opens the Halka menu, taps "Duck breast" and opens the "Why these wines?" explanation.

## Then

1. The settings are saved (the page confirms with saved=settings).
2. The wine screen shows "Sommelier’s pairing" and no glass icon is labelled with a percentage.
3. At least one glass icon is labelled "Match shown by how full the glass is".
4. The opened explanation says "A fuller glass means a better fit."
5. The explanation does not contain "Recommended for your dish" or "pairing rules".
6. No number followed by a percent sign appears anywhere on the screen.

## Edge cases covered

- Both settings off at once (scores hidden, unreviewed pairings hidden).
- The settings are restored to on even if an assertion fails.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- The test continues the browser session of the earlier tests in the same file (page state and sign-in carry over), so it is not meant to run alone.
- Temporarily changes two guest settings of Halka; a final step always switches both back on and saves, so later tests see the restaurant as seeded.

## Test implementation

[packages/app/tests/e2e/admin.e2e.test.ts](../../../packages/app/tests/e2e/admin.e2e.test.ts): `guest settings change what G3 and its explanation say (spec 2026-10-16-how-it-works-explanations, AC8, AC9)`
