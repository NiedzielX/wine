---
id: showcase-005-showcase-private-no-cookie-one-counter-line
area: showcase
title: "Private page: no cache, no index, no cookie, no outside resource, one counter line"
status: automated
spec:
  path: .ai/specs/2026-11-04-sales-demo-and-roi-calculator.md
  ac: ["AC15", "AC16"]
test:
  file: packages/app/tests/e2e/showcase.e2e.test.ts
  it: "is never cached or indexed, sets no cookie, loads nothing from another host and logs one counter line without the numbers"
---

# showcase-005-showcase-private-no-cookie-one-counter-line: Private page: no cache, no index, no cookie, no outside resource, one counter line

## Goal

A visit to the calculator leaves no trace on the visitor and one anonymous line in the operator’s log.

## Given

1. The app logs at info level.

## When

1. Open the calculator with a distinctive number of guests.

## Then

1. The answer is not cacheable and says noindex in the header and in the page.
2. No cookie is set and no address or stylesheet points to another host.
3. Exactly one new log line "showcase_view" appears, with only the page name; the number of guests is nowhere in the log.

## Edge cases covered

- Network requests of a real browser are not listed; the test reads the addresses in the HTML and in the stylesheets.

## Data and cleanup

- Nothing is written. Plain HTTP, no browser; the built app runs with the showcase mode "calculator" (global setup of the e2e run).

## Test implementation

[packages/app/tests/e2e/showcase.e2e.test.ts](../../../packages/app/tests/e2e/showcase.e2e.test.ts): `is never cached or indexed, sets no cookie, loads nothing from another host and logs one counter line without the numbers`
