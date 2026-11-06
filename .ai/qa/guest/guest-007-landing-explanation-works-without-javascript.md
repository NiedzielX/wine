---
id: guest-007-landing-explanation-works-without-javascript
area: guest
title: "Landing explanation works without javascript"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
  ac: ["AC2"]
test:
  file: packages/app/tests/e2e/how-it-works.e2e.test.ts
  it: "G0: no script runs; one closed \"How do we pick your wine?\" opens with a tap"
---

# guest-007-landing-explanation-works-without-javascript: Landing explanation works without javascript

## Goal

The landing page explanation "How do we pick your wine?" works with no script running at all.

## Given

1. A guest opens the Halka landing page in a browser that blocks every script file.

## When

1. The guest taps the explanation.

## Then

1. The page runs no client script.
2. There is exactly one explanation, closed at first, and it is not inside a link, button or paragraph.
3. After the tap it is open and says "No producer pays to be listed." and "recommended by Marta Wierzbicka".

## Edge cases covered

- Disclosure works as plain HTML (no JavaScript).

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- The dish list is read once from the public menu API.

## Test implementation

[packages/app/tests/e2e/how-it-works.e2e.test.ts](../../../packages/app/tests/e2e/how-it-works.e2e.test.ts): `G0: no script runs; one closed "How do we pick your wine?" opens with a tap`
