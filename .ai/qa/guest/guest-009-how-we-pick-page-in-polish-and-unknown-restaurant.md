---
id: guest-009-how-we-pick-page-in-polish-and-unknown-restaurant
area: guest
title: "How we pick page in polish and unknown restaurant"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
  ac: ["AC12"]
test:
  file: packages/app/tests/e2e/how-it-works.e2e.test.ts
  it: "G12 in Polish, and a 404 for an unknown restaurant"
---

# guest-009-how-we-pick-page-in-polish-and-unknown-restaurant: How we pick page in polish and unknown restaurant

## Goal

The explanation page exists in Polish and an unknown restaurant gets a friendly "not available" page.

## Given

1. A script-free browser.

## When

1. The guest opens the explanation page with the Polish language switch.
2. The guest opens the explanation page of a restaurant that does not exist.

## Then

1. The heading is "Jak dobieramy wino".
2. Two links lead back to the Polish landing page and keep the language.
3. The unknown restaurant shows "This menu isn’t available".

## Edge cases covered

- Language switch kept in the back links.
- Unknown restaurant.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- All script requests of the browser session are aborted before the first page, so the page is checked as plain HTML.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/how-it-works.e2e.test.ts](../../../packages/app/tests/e2e/how-it-works.e2e.test.ts): `G12 in Polish, and a 404 for an unknown restaurant`

**Notes for the reviewer:** The unknown-restaurant check asserts only that some text matching "This menu isn’t available" appears, not an HTTP status, although the title says 404.
