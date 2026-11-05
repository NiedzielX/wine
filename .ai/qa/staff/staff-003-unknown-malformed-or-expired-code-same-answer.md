---
id: staff-003-unknown-malformed-or-expired-code-same-answer
area: staff
title: "Unknown malformed or expired code same answer"
status: automated
spec:
  path: .ai/specs/2026-10-16-recommendation-code.md
  ac: ["AC8"]
test:
  file: packages/app/tests/e2e/staff-code.e2e.test.ts
  it: "an unknown, malformed or yesterday's code: the same sentence and the same status; a post changes nothing (AC8)"
---

# staff-003-unknown-malformed-or-expired-code-same-answer: Unknown malformed or expired code same answer

## Goal

An unknown, malformed or yesterday’s code gets the same sentence, so the waiter cannot learn whether a code ever existed, and a replayed post changes nothing.

## Given

1. A fresh code that is then moved to yesterday in the database, an unknown well-formed code and a malformed code.

## When

1. The waiter looks up each of the three codes.
2. Someone replays a form from today’s code with the yesterday code substituted.

## Then

1. Each lookup loads (200) with no code card.
2. The three answers are identical once the typed code is masked.
3. The answer says there is no code "…" today in this restaurant and asks to check the characters on the guest’s screen.
4. The replayed post redirects to "codeError=not_found".
5. Neither the old code nor today’s code is confirmed.

## Edge cases covered

- Yesterday’s code is indistinguishable from an unknown one.
- Replay with another code leaves both rows unchanged.

## Data and cleanup

- Plain HTTP requests with a phone user agent, as a browser without JavaScript would send them; no real browser is started.
- Each test first opens a wine page for an active Halka wine in a new guest session to get a fresh code; those code rows stay in the database and are never reused by another test.
- Moves one issued code to the previous day and issues a second fresh code; both rows stay in the database unconfirmed.

## Test implementation

[packages/app/tests/e2e/staff-code.e2e.test.ts](../../../packages/app/tests/e2e/staff-code.e2e.test.ts): `an unknown, malformed or yesterday's code: the same sentence and the same status; a post changes nothing (AC8)`
