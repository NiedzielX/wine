---
id: usage-004-synthetic-traffic-and-link-previews-record-nothing
area: usage
title: "Synthetic traffic and link previews record nothing"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC6b"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "our synthetic traffic and a link preview get the page and record nothing (AC6b)"
---

# usage-004-synthetic-traffic-and-link-previews-record-nothing: Synthetic traffic and link previews record nothing

## Goal

The app’s own synthetic traffic and chat-app link previews get the page but record no events.

## Given

1. The Halka landing page.

## When

1. It is requested once with the synthetic-traffic header and once with a WhatsApp link-preview user agent.

## Then

1. Both requests load (200).
2. After a wait of one second no events exist for the session id shown on either page.

## Edge cases covered

- Synthetic header and link-preview agent.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Nothing is stored.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `our synthetic traffic and a link preview get the page and record nothing (AC6b)`
