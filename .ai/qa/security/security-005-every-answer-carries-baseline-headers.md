---
id: security-005-every-answer-carries-baseline-headers
area: security
title: "Every answer carries the baseline security headers"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/security-headers.e2e.test.ts
  it: "every kind of answer (page, redirect, 404, JSON, error) carries the baseline security headers and no framework banner"
---

# security-005-every-answer-carries-baseline-headers: Every answer carries the baseline security headers

## Goal

Pages, redirects, 404s, JSON and error answers all carry the same security headers and no framework banner. (threat T-14, T-15, docs/security/threat-model.md).

## Given

1. The built app runs under `next start`.

## When

1. Eleven kinds of address are requested: guest page and 404, unknown restaurant, sign-in, panel redirect, dead invitation link, showcase, public API, API 401 and 404, health.

## Then

1. Each carries `X-Content-Type-Options: nosniff`, a referrer policy, `X-Frame-Options: DENY`, a CSP with `frame-ancestors 'none'`, `base-uri`, `object-src` and `form-action`, and a Permissions-Policy, and none carries `X-Powered-By`.

## Edge cases covered

- No `script-src`: a nonce-based policy is an open item (T-16).

## Data and cleanup

- Read-only requests.

## Test implementation

[packages/app/tests/e2e/security-headers.e2e.test.ts](../../../packages/app/tests/e2e/security-headers.e2e.test.ts): `every kind of answer (page, redirect, 404, JSON, error) carries the baseline security headers and no framework banner`
