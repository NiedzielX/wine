---
id: guest-021-pick-label-on-guest-pages-and-explanation
area: guest
title: "The pick label is on the guest pages and explained in both languages"
status: automated
spec:
  path: .ai/specs/2026-11-18-restaurant-picks.md
  ac: ["AC12", "AC13"]
test:
  file: packages/app/tests/e2e/picks-guest.e2e.test.ts
  it: "G3, G7 and G9 show the restaurant's pick in English and Polish, never with the seal wording; G12 says what it is"
---

# guest-021-pick-label-on-guest-pages-and-explanation: The pick label is on the guest pages and explained in both languages

## Goal

A guest and a waiter see the restaurant's mark on the wines it marked, in plain text and in both languages, and "How we pick your wine" explains it.

## Given

1. The five picks are published; nobody is signed in; no JavaScript runs.

## When

1. Open the wines of a dish with a pick (English and Polish), the wine page with and without the dish, and the waiter lookup.
2. Open "How we pick your wine" in English and Polish.

## Then

1. The wines page shows "Restaurant’s pick" / "Wybór restauracji" next to the wine.
2. The wine page shows the label for that dish and none without the dish.
3. The waiter lookup shows the label.
4. No page contains the word AI.
5. The explanation page has the sentence about the restaurant's pick in both languages.

## Edge cases covered

- A first place that is a pick is headed with the label instead of "Recommended for your dish": covered by the unit test of the page.

## Data and cleanup

- Snapshot of the whole database before, restored after (the e2e files share one database).

## Test implementation

[packages/app/tests/e2e/picks-guest.e2e.test.ts](../../../packages/app/tests/e2e/picks-guest.e2e.test.ts): `G3, G7 and G9 show the restaurant's pick in English and Polish, never with the seal wording; G12 says what it is`
