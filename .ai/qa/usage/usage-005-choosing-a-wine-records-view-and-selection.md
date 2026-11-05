---
id: usage-005-choosing-a-wine-records-view-and-selection
area: usage
title: "Choosing a wine records view and selection"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC7"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "dish → wine → \"Choose this wine\": wine_viewed and wine_selected with dish, serving and context dish (AC7)"
---

# usage-005-choosing-a-wine-records-view-and-selection: Choosing a wine records view and selection

## Goal

Choosing a wine for a dish records that the wine was viewed and selected, with the dish, serving and context.

## Given

1. A guest session (no JavaScript) that goes from the menu to a dish, to a wine page.

## When

1. The guest submits "Choose this wine" for a bottle.

## Then

1. The result page loads (200), shows "Show this to your waiter" and sets no cookie.
2. The stored events are, in order: session started, menu viewed, recommendations viewed, wine viewed, wine selected.
3. The wine view carries the dish, the wine and context "dish".
4. The selection carries the dish, the wine, serving "bottle" and context "dish", and the same menu version as the session start.

## Edge cases covered

- Selection keeps the menu version of the session.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `dish → wine → "Choose this wine": wine_viewed and wine_selected with dish, serving and context dish (AC7)`
