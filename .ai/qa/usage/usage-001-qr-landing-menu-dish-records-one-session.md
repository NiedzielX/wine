---
id: usage-001-qr-landing-menu-dish-records-one-session
area: usage
title: "Qr landing menu dish records one session"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-guest-usage-events.md
  ac: ["AC1","AC2","AC6a","AC6b"]
test:
  file: packages/app/tests/e2e/usage-events.e2e.test.ts
  it: "QR landing → menu → dish wines: one session with its start, both views and the wines shown; no cookie"
---

# usage-001-qr-landing-menu-dish-records-one-session: Qr landing menu dish records one session

## Goal

A guest following the QR landing, the menu and a dish’s wines produces one session with its start, two menu views and the wines shown, and no cookie.

## Given

1. A guest session (no JavaScript) that opens the Halka landing page, the whole-table page, the menu and a dish’s wines page.

## When

1. Each page is requested in order, carrying the session id in its links.

## Then

1. All pages load (200) and none sets a cookie.
2. The stored events for the session are, in order: session started, menu viewed, menu viewed, recommendations viewed.
3. All events belong to Halka and to that session.
4. The session start has source "qr" and a menu version.
5. The recommendations event names the dish, carries an engine version starting with "wm-rules-", lists at least one wine and the same menu version.

## Edge cases covered

- No cookie is used to track the session.
- The session id travels in the links.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- The write happens after the response, so the test polls for the rows.
- Uses fixed or freshly generated session ids; the rows it causes are written under those ids and not deleted.

## Test implementation

[packages/app/tests/e2e/usage-events.e2e.test.ts](../../../packages/app/tests/e2e/usage-events.e2e.test.ts): `QR landing → menu → dish wines: one session with its start, both views and the wines shown; no cookie`
