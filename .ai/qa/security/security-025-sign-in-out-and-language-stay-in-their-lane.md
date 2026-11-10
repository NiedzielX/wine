---
id: security-025-sign-in-out-and-language-stay-in-their-lane
area: security
title: "Sign-in, sign-out and the language switch stay in their lane"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts
  it: "T-36: login, logout and the language switch: a wrong password or an outside `next` gets nothing; logout ends only the caller's own session; the language switch touches no data"
---

# security-025-sign-in-out-and-language-stay-in-their-lane: Sign-in, sign-out and the language switch stay in their lane

## Goal

The public form doors of the panel give nothing to a wrong password, follow no outside address, end only your own session and write no data (threat T-36).

## Given

1. Tomasz (Halka manager) has an account; a second session of his is open.

## When

1. Tomasz signs in with an outside `next` and planted role and restaurant fields; then a wrong password and an unknown e-mail are tried.
2. He signs out with a planted field naming his other session; a visitor without a session signs out the same way.
3. The language is switched to English, to an unknown language and with outside return addresses.

## Then

1. The sign-in lands on Halka (not the outside address), makes one session and grants nothing in Bistro.
2. A wrong password and an unknown e-mail get the same answer and no session; only the failed-attempt counter of the account moves.
3. Sign-out ends exactly one session, the caller's; the other session still works; without a session nothing ends.
4. The language switch sets only `pl` or `en`, returns only to a dashboard address and writes no row.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-09-boundaries-part2.md`).

## Data and cleanup

- The counter of failed attempts is reset in the test; sessions are removed by the database restore.

## Test implementation

[packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-writes.e2e.test.ts): `T-36: login, logout and the language switch: a wrong password or an outside `next` gets nothing; logout ends only the caller's own session; the language switch touches no data`
