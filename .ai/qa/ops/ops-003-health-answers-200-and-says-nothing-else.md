---
id: ops-003-health-answers-200-and-says-nothing-else
area: ops
title: "The health check answers 200 and says nothing else"
status: automated
spec:
  path: .ai/specs/2026-10-15-production-deployment.md
  ac: ["AC5"]
test:
  file: packages/app/tests/e2e/health.e2e.test.ts
  it: "answers 200 without a session, never cached, and says nothing about the installation"
---

# ops-003-health-answers-200-and-says-nothing-else: The health check answers 200 and says nothing else

## Goal

An uptime checker asks whether the app can serve and learns nothing else about the installation.

## Given

1. The built app runs on PostgreSQL with the demo restaurant "halka" loaded.

## When

1. Request the health address without any cookie.

## Then

1. The answer is 200 and is marked as not cacheable.
2. The body is exactly: status "ok", data source "postgres", database check "ok".
3. The body contains no restaurant name, database name, host or version.

## Edge cases covered

- No session is sent.

## Data and cleanup

- Nothing is written. The shared e2e app is only read. Plain HTTP, no browser.

## Test implementation

[packages/app/tests/e2e/health.e2e.test.ts](../../../packages/app/tests/e2e/health.e2e.test.ts): `answers 200 without a session, never cached, and says nothing about the installation`
