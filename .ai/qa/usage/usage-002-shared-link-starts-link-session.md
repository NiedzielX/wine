---
id: usage-002-shared-link-starts-link-session
area: usage
title: "Shared link starts link session"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC4"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "a shared link without sid starts a `link` session and its links carry it (AC4)"
---

# usage-002-shared-link-starts-link-session: Shared link starts link session

## Goal

A shared dish link without a session id starts a "link" session whose links carry the new id.

## Given

1. A dish id taken from the menu page.

## When

1. A guest opens the dish wines page directly with a serving preference of glass, without a session id.

## Then

1. The page carries a new session id.
2. Two events are stored: session started and recommendations viewed.
3. The session start has source "link".
4. The recommendations event stores the preference serving "glass".

## Edge cases covered

- Source "link" instead of "qr".
- Preferences recorded with the view.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `a shared link without sid starts a `link` session and its links carry it (AC4)`
