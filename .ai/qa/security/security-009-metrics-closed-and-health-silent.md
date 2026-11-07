---
id: security-009-metrics-closed-and-health-silent
area: security
title: "Metrics closed and health says nothing"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/security-headers.e2e.test.ts
  it: "the metrics endpoint is closed without the token, and the health answer names nothing about the installation"
---

# security-009-metrics-closed-and-health-silent: Metrics closed and health says nothing

## Goal

Metrics need the bearer token; the public health answer reveals nothing about the installation. (threat T-18, docs/security/threat-model.md).

## Given

1. The instance runs with a metrics token.

## When

1. Metrics are requested without a token; health is requested.

## Then

1. Metrics answer 401 with `WWW-Authenticate: Bearer`; the health body names no database, version, host or password.

## Edge cases covered

- Only what the Then steps list.

## Data and cleanup

- Read-only requests.

## Test implementation

[packages/app/tests/e2e/security-headers.e2e.test.ts](../../../packages/app/tests/e2e/security-headers.e2e.test.ts): `the metrics endpoint is closed without the token, and the health answer names nothing about the installation`
