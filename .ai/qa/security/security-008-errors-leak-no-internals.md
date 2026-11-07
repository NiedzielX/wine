---
id: security-008-errors-leak-no-internals
area: security
title: "Error answers leak no internals"
status: automated
spec:
  path: none
test:
  file: packages/app/tests/e2e/security-headers.e2e.test.ts
  it: "error answers carry no stack trace, file path, library name or connection detail: a bad id, a malformed path, a broken body, a forged server action"
---

# security-008-errors-leak-no-internals: Error answers leak no internals

## Goal

Failures answer with a short generic body: no stack trace, file path, library name or connection detail. (threat T-17, docs/security/threat-model.md).

## Given

1. The built app runs.

## When

1. Seven failing requests are sent: malformed percent-encoding (guest and panel path), broken JSON, a 3 MB body, a forged server action id, a dish id that is not a UUID, a patch with an unknown id.

## Then

1. None of the bodies matches stack, path, library or connection patterns, and none carries `X-Powered-By`.

## Edge cases covered

- Malformed percent-encoding answers a generic 500, not 400 (framework behaviour, recorded as T-17).

## Data and cleanup

- Read-only or rejected requests.

## Test implementation

[packages/app/tests/e2e/security-headers.e2e.test.ts](../../../packages/app/tests/e2e/security-headers.e2e.test.ts): `error answers carry no stack trace, file path, library name or connection detail: a bad id, a malformed path, a broken body, a forged server action`
