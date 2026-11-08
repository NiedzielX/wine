---
id: showcase-007-demo-guide-links-tour-and-ribbon
area: showcase
title: "The demo guide, its working links, the tour and the demo ribbon"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC9", "AC14"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "serves the guide with working links, the tour and the ribbon on guest pages; the panel and KPI pages are not built yet"
---

# showcase-007-demo-guide-links-tour-and-ribbon: The demo guide, its working links, the tour and the demo ribbon

## Goal

A restaurant that gets the link of the demo instance can walk through the steps that exist, read the short tour, and always see that the data is invented.

## Given

1. An instance runs in demo mode: in-memory data, the flag that allows demo data, production mode with a public https address.

## When

1. Open the guide in Polish, then open each of its step links.
2. Open the panel and KPI addresses.
3. Open the tour in English.
4. Open a guest page on the main instance, which is not in demo mode.

## Then

1. The guide answers 200, is never cached or indexed, sets no cookie, and has no wording about artificial intelligence.
2. Three steps are links (a dish with the sommelier's seal, the whole table, the waiter's lookup); each answers 200, carries the language and no session id, shows the "demonstration data" strip with a link back that carries the language only; the dish page shows "Para sommeliera".
3. The panel and KPI addresses answer 404 (later phase); the guide marks those two steps as coming.
4. The tour has five sections, a link to the explainer for guests, and no AI wording.
5. The guest page and the sign-in page of the main instance have no demonstration strip and no robots rule (they stay indexable).

## Edge cases covered

- Steps 4 and 5 of the guide are not links while their pages do not exist.

## Data and cleanup

- Nothing is written; the demo instance is started by the test on a free port and stopped at the end.

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `serves the guide with working links, the tour and the ribbon on guest pages; the panel and KPI pages are not built yet`
