---
id: guest-006-why-these-wines-explanation-opens
area: guest
title: "Why these wines explanation opens"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/home.e2e.test.ts
  it: "one closed \"Why these wines?\" above the wines; a tap opens it (spec 2026-10-16-how-it-works-explanations, AC2)"
---

# guest-006-why-these-wines-explanation-opens: Why these wines explanation opens

## Goal

The wines page has one closed "Why these wines?" explanation above the wines, and a tap opens it.

## Given

1. The guest is on the wines page of a dish.

## When

1. The guest taps the explanation.

## Then

1. Before the tap the page has exactly one explanation and it is closed.
2. The explanation is not nested inside a link, a button or a paragraph.
3. After the tap it is open.
4. It says "price never raises it" and "Sommelier’s pairing: chosen for this dish by Marta Wierzbicka".

## Edge cases covered

- Explanation is not placed inside an interactive element (link or button).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- The test continues the browser session of the earlier tests in the same file (the page it starts on is the one the previous test left), so it is not meant to run alone.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/home.e2e.test.ts](../../../packages/app/tests/e2e/home.e2e.test.ts): `one closed "Why these wines?" above the wines; a tap opens it (spec 2026-10-16-how-it-works-explanations, AC2)`
