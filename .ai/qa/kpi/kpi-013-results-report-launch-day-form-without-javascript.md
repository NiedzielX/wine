---
id: kpi-013-results-report-launch-day-form-without-javascript
area: kpi
title: "Results report: the launch day form works without JavaScript"
status: automated
spec:
  path: .ai/specs/2026-11-18-owner-proof-report.md
  ac: ["AC5", "AC15"]
test:
  file: packages/app/tests/e2e/proof-report.e2e.test.ts
  it: "A33: the launch day form works without JavaScript: a second entry needs a reason, a stale form is refused, nothing is overwritten, the history grows"
---

# kpi-013-results-report-launch-day-form-without-javascript: Results report: the launch day form works without JavaScript

## Goal

Changing the launch day keeps the history, needs a reason and cannot overwrite a newer entry, with a plain form post.

## Given

1. Halka has one launch day entry and sales.

## When

1. The General Manager posts the form without a reason, with a stale form, with a day in the future, and then with a reason.
2. The same form is posted again with the old identifier.

## Then

1. Without a reason the post is refused with "reason required"; a stale form with "version conflict"; a future day with "invalid launch day"; no row changes.
2. With a reason a second entry is stored and the first one is unchanged; the screen shows "changed 1 time" and the reason in the history.
3. The repeated post with the old identifier is a conflict and no third row appears.

## Edge cases covered

- A day in the future.

## Data and cleanup

- Uses the data of the previous scenarios.

## Test implementation

[packages/app/tests/e2e/proof-report.e2e.test.ts](../../../packages/app/tests/e2e/proof-report.e2e.test.ts): `A33: the launch day form works without JavaScript: a second entry needs a reason, a stale form is refused, nothing is overwritten, the history grows`
