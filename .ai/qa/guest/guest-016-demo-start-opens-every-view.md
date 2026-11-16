---
id: guest-016-demo-start-opens-every-view
area: guest
title: "Demo start page opens every view"
status: automated
spec:
  path: .ai/specs/2026-11-16-interactive-demo-entry.md
  ac: ["AC2", "AC5", "AC7"]
test:
  file: packages/app/tests/e2e/demo-entry.e2e.test.ts
  it: "/start opens every view of the seeded PostgreSQL demo in Polish and English, is never cached or indexed, and the way back leads to it"
---

# guest-016-demo-start-opens-every-view: Demo start page opens every view

## Goal

The start page of the interactive demo instance opens every view of the invented restaurant in one click, in both languages, and every view leads back to it.

## Given

1. An instance on PostgreSQL after `db:seed` runs with `ALLOW_DEMO_DATA=true` and `SHOWCASE_MODE=calculator`; nobody is signed in.
2. The shared test instance has no demo flag (negative control).

## When

1. A visitor opens `/start?lang=pl` and `/start?lang=en`, then `/start` with a Polish browser language and with none.
2. The visitor follows every link of the page, tries the QR page without a session, opens the bare address `/` and a guest page.
3. The same visitor opens `/start`, `/` and a guest page on the instance without the flag.

## Then

1. `/start` answers 200 in both languages with the demonstration-data sentence, no "AI" wording, no cookie, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` and a robots meta tag.
2. The links are the guest page, the whole table, the waiter lookup, the waiter whole table and the calculator, each with the language, and each answers 200.
3. The language follows `?lang`, then the browser, then English.
4. The QR page is not linked and, without a session, sends the visitor to the sign-in page.
5. `/` redirects to `/start`; a guest page shows the ribbon "Demonstration data" with a link to `/start?lang=pl` and a noindex robots tag.
6. Without the flag `/start` is a 404 that still carries the noindex header, `/` goes to the restaurant and no ribbon is shown.

## Edge cases covered

- Both languages, the two language fallbacks and the missing-flag case. The test does not look at the layout: widths of 390 and 1440 px are a manual check.

## Data and cleanup

- Starts two extra built instances and restores the shared database at the end; reads only.

## Test implementation

[packages/app/tests/e2e/demo-entry.e2e.test.ts](../../../packages/app/tests/e2e/demo-entry.e2e.test.ts): `/start opens every view of the seeded PostgreSQL demo in Polish and English, is never cached or indexed, and the way back leads to it`
