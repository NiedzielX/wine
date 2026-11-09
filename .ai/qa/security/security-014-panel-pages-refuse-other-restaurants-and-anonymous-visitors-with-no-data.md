---
id: security-014-panel-pages-refuse-other-restaurants-and-anonymous-visitors-with-no-data
area: security
title: "Panel pages refuse other restaurants and anonymous visitors with no data"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts
  it: "T-29: panel pages (KPI, opportunities, publish, QR, setup, team, imports, details): own pages render, the other restaurant gets 403 or 404 with none of its data, no row changes"
---

# security-014-panel-pages-refuse-other-restaurants-and-anonymous-visitors-with-no-data: Panel pages refuse other restaurants and anonymous visitors with no data

## Goal

No panel page, KPI and opportunities included, shows data of a restaurant to anyone but its team, in the visible page or in the page payload that comes with a 403 or a sign-in redirect. (threat T-29, docs/security/threat-model.md).

## Given

1. Halka and Bistro E2E have data; Tomasz and Anna are signed in; a third visitor has no session.
2. Bistro E2E gets the sample wine list and menu (confirmed imports) in `beforeAll` when it has no dishes, so its positive controls read real rows.

## When

1. Positive controls: each of them opens 16 pages of their own restaurant (dashboard with KPI, menu, wines, review, opportunities, publish, QR, setup, imports, team, details of a dish, pairings of a dish, a wine): 200 with the restaurant name.
2. They open the same pages under the other slug, ids of the other restaurant under their own slug, the import screens with a foreign job id; an anonymous visitor opens every page; a Wine Director opens the team page.

## Then

1. Other slug: 403; foreign id under own slug: 404; anonymous: redirect; no body contains a dish, wine, file or restaurant name of the other restaurant. Red before the fix: the menu list carried every dish name of any restaurant to any caller.
2. Payloads and table digest unchanged.

## Edge cases covered

- Mutation proof recorded in the run log (`.ai/runs/2026-11-08-boundaries-part1.md`).

## Data and cleanup

- Objects created by the controls (pairings, staged imports) are removed in the test or `afterAll`; the sample imports of Bistro E2E stay.

## Test implementation

[packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts](../../../packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts): `T-29: panel pages (KPI, opportunities, publish, QR, setup, team, imports, details): own pages render, the other restaurant gets 403 or 404 with none of its data, no row changes`
