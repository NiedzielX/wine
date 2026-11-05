---
id: staff-004-cross-site-post-changes-nothing
area: staff
title: "Cross site post changes nothing"
status: automated
spec:
  path: .ai/specs/2026-10-16-recommendation-code.md
  ac: ["AC15"]
test:
  file: packages/app/tests/e2e/staff-code.e2e.test.ts
  it: "a post the browser marks cross-site, or from a foreign origin, changes nothing (AC15)"
---

# staff-004-cross-site-post-changes-nothing: Cross site post changes nothing

## Goal

A form post marked cross-site, or from a foreign origin, does not confirm a code, while the same form from the site itself does.

## Given

1. A fresh code and the waiter’s form for it.

## When

1. The form is posted with a cross-site marker, then from the foreign origin evil.example, then from the site itself.

## Then

1. The cross-site post redirects back to the page without "marked" and the code is not confirmed.
2. The foreign-origin post is not accepted (no 303) and the code is not confirmed.
3. The same form from the site itself redirects with "marked=confirmed" and the code is confirmed.

## Edge cases covered

- Cross-site header and foreign origin header.
- Control case proving the form itself is valid.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Each test first opens a wine page for an active Halka wine in a new guest session to get a fresh code; those code rows stay in the database and are never reused by another test.
- The code ends confirmed (control case).

## Test implementation

[packages/app/tests/e2e/staff-code.e2e.test.ts](../../../packages/app/tests/e2e/staff-code.e2e.test.ts): `a post the browser marks cross-site, or from a foreign origin, changes nothing (AC15)`
