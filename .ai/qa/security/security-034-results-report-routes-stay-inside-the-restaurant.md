---
id: security-034-results-report-routes-stay-inside-the-restaurant
area: security
title: "Results report routes stay inside the restaurant"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC10", "AC11", "AC12", "AC13"]
test:
  file: packages/app/tests/e2e/proof-boundary.e2e.test.ts
  it: "T-43: both restaurants read their own report and set their own launch day; another slug, roles without proof.view or proof.manage, a stray field and a stale precondition are refused, and no table or payload changes"
---

# security-034-results-report-routes-stay-inside-the-restaurant: Results report routes stay inside the restaurant

## Goal

The results report and the launch day log work for the own restaurant and are closed to the other one, to the Wine Director, and as a way to learn anything about another restaurant's sales or about a single POS check.

## Given

1. Two restaurants (Halka and Bistro E2E), each with POS lines for a baseline and a first window (recognisable check ids and a recommendation code in the lines); the General Manager of Halka, the Wine Director of Halka, the owner of Bistro and the Wine Director of Bistro are signed in.

## When

1. The General Manager of Halka and the owner of Bistro each set their launch day and read the report of window 1 and 2.
2. Each side tries the other's slug (read and write), a Wine Director reads and writes the own restaurant, a body with a field outside the schema, a future and a malformed launch day, a second entry without a reason, no precondition, a malformed `If-Match`, a stale one, a request without the CSRF token and one without a session; windows `0`, `13`, `1e9` and `abc` are requested.

## Then

1. Own launch days answer 201, own reports answer 200 with exactly the own counts of checks with food and with wine.
2. A foreign slug answers 403 without any count or id of the other side; a Wine Director answers 403 `forbidden` for both the report and the write; a stray field, a future or malformed day, a missing reason and a bad window answer 422; no precondition answers 428, a malformed `If-Match` 400, a stale one 409; no CSRF token answers 403 and no session 401.
3. No answer contains a check id, a code, a session id or a membership.
4. Every payload (reports of both restaurants, windows 1 and 2) and the digest of every table, `proof_launch_day` and `sales_record` included, are exactly as before the refused attempts; each restaurant still has its one entry. The allowed second entry changes only its own restaurant.

## Edge cases covered

- Mutation (run once, recorded in the run log): the restaurant filter removed from `PgProofLaunchRepository.read` turns the test red (Bistro then sees Halka's entry as the current one).

## Data and cleanup

- Snapshot of the whole database before, restored after; the POS lines are inserted with SQL inside the test.

## Test implementation

[packages/app/tests/e2e/proof-boundary.e2e.test.ts](../../../packages/app/tests/e2e/proof-boundary.e2e.test.ts): `T-43: both restaurants read their own report and set their own launch day; another slug, roles without proof.view or proof.manage, a stray field and a stale precondition are refused, and no table or payload changes`
