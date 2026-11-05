---
id: admin-008-opportunities-page-is-plain-html
area: admin
title: "Opportunities page is plain html"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-16-sommelier-opportunities.md
  ac: []
test:
  file: packages/app/tests/e2e/opportunities.e2e.test.ts
  it: "the page has no script running: the explanation and the inbox are plain HTML"
---

# admin-008-opportunities-page-is-plain-html: Opportunities page is plain html

## Goal

The opportunities inbox (A14) works as plain HTML: the explanation and the list are there although no script runs.

## Given

1. The sommelier is signed in, in a browser where every script request is aborted.

## When

1. The sommelier opens the Opportunities page.

## Then

1. The page shows "What are opportunities?".
2. The page reports that no client script is running.
3. There is exactly one explanation block for opportunities.
4. At least one opportunity is listed.

## Edge cases covered

- Page works without JavaScript.

## Data and cleanup

- Runs against the shared built app and the e2e database seeded with the demo restaurant Halka (sommelier Marta Wierzbicka, password-protected demo accounts). The test file uses its own browser session, so cookies are not shared with other files.
- All script files are blocked for this session, so the page is served as pure HTML.
- Read-only: the test changes no data.

## Test implementation

[packages/app/tests/e2e/opportunities.e2e.test.ts](../../../packages/app/tests/e2e/opportunities.e2e.test.ts): `the page has no script running: the explanation and the inbox are plain HTML`

**Notes for the reviewer:** The spec ACs are cited only at file level (AC7, AC8: A6 and A14 without JavaScript); the test name does not name one.
