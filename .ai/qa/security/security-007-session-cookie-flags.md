---
id: security-007-session-cookie-flags
area: security
title: "Session cookie flags"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/security-headers.e2e.test.ts
  it: "the session cookie is HttpOnly, SameSite=Lax and path-wide; Secure is the production default (config) and is switched off only by the e2e harness"
---

# security-007-session-cookie-flags: Session cookie flags

## Goal

The session cookie is HttpOnly, SameSite=Lax, path-wide and expiring; guests get no cookie. (threat T-05, docs/security/threat-model.md).

## Given

1. Marta of Halka signs in through the API.

## When

1. The login answer's `Set-Cookie` is read.
2. The guest landing page is requested.

## Then

1. One cookie with `HttpOnly`, `SameSite=Lax`, `Path=/` and an expiry; the login answer is `no-store`; the guest page sets no cookie.

## Edge cases covered

- `Secure` is not asserted here because the harness runs over http with `AUTH_COOKIE_SECURE=false`; the production default is asserted in `packages/core/tests/env.test.ts`.

## Data and cleanup

- Opens one session.

## Test implementation

[packages/app/tests/e2e/security-headers.e2e.test.ts](../../../packages/app/tests/e2e/security-headers.e2e.test.ts): `the session cookie is HttpOnly, SameSite=Lax and path-wide; Secure is the production default (config) and is switched off only by the e2e harness`
