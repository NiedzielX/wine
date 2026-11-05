---
id: usage-009-prefetched-links-record-nothing-with-javascript
area: usage
title: "Prefetched links record nothing with javascript"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC6"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "prefetched links record nothing; each screen the guest opens records once"
---

# usage-009-prefetched-links-record-nothing-with-javascript: Prefetched links record nothing with javascript

## Goal

In a real browser with JavaScript, links prefetched by the router record nothing, and each screen the guest actually opens records once.

## Given

1. A browser with scripts on on the Halka landing page, waiting 1.5 seconds so links in view are prefetched.

## When

1. The guest taps the "Duck breast" link.

## Then

1. The browser shows the wines page with a session id.
2. After a wait of one second the stored events are exactly: session started, menu viewed, recommendations viewed.
3. The recommendations event names the opened dish.

## Edge cases covered

- Prefetch of dish links does not create events.
- Soft navigation records each screen once.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka. The test file uses its own browser session.
- Writes events under the session id of the page; they are not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `prefetched links record nothing; each screen the guest opens records once`

**Notes for the reviewer:** The landing page itself records the "menu viewed" event, so the three events are the landing, the dish page and the session start; the test does not walk further screens.
