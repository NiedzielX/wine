# QA scenarios

Every end-to-end test of Wine Match has a plain Markdown scenario here. A QA person who does not read TypeScript reviews the scenario; the scenario links to the test that automates it, and the test names the scenario back in its review. The scenario says **what** the product must do; the test says **how** it is checked.

Two things are mandatory and neither replaces the other:

- the test code (`packages/app/tests/e2e/*.e2e.test.ts`);
- the scenario Markdown for each `it` of that test.

A test without a scenario, or a scenario without a test, fails `node scripts/check-qa-scenarios.mjs`. Best practices for writing both are in [`.ai/skills/om-integration-tests/references/best-practices.md`](../skills/om-integration-tests/references/best-practices.md).

## Naming

`.ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md`

- `AREA`: one of the areas below, lowercase.
- `NNN`: three digits, numbered per area from `001`, never reused. Do not renumber when a scenario is removed.
- `slug`: lowercase ASCII words joined by hyphens.
- The front matter `id` equals the file name without `.md`.
- One business case per scenario: one `it` is one scenario, unless several `it`s are clearly one case.

## Areas

| Area | What it covers |
| --- | --- |
| `guest` | The guest path: landing, menu, wines of a dish, whole table, "How we pick your wine", the recommendation code on the guest screen |
| `staff` | The waiter: lookup by dish, whole table (G11), "Order from a code" (G9), table quantity for the waiter |
| `admin` | The restaurant panel: sign-in, settings, pairings, opportunities and their roles |
| `kpi` | Dashboard indicators: guest usage, pairing performance, sales and attach rate |
| `usage` | Usage events written by the guest and staff paths |
| `restaurant` | The restaurant created by the operator command and its isolation |
| `ops` | Operator-facing behaviour of the running app: metrics endpoint, request log, health check, production smoke test |
| `import` | Reserved for menu, wine and sales import (no end-to-end test yet) |

Add a new area only when no existing one fits, and add it to this table in the same change.

## Template

```markdown
---
id: guest-001-example-slug
area: guest
title: "Short human title"
status: automated
spec:
  path: .ai/specs/implemented/2026-10-15-example.md   # or: none
  ac: ["AC1", "AC2"]                                  # only ids the test names
test:
  file: packages/app/tests/e2e/example.e2e.test.ts
  it: "the exact title of the it(...) call"
---

# guest-001-example-slug: Short human title

## Goal
One sentence, user-visible behaviour.

## Given
1. Numbered preconditions.

## When
1. Numbered user actions.

## Then
1. Numbered, concrete, observable results. No selectors, no function names.

## Edge cases covered
- Only what the test really asserts.

## Data and cleanup
- What the test seeds or creates, and how it avoids affecting other tests.

## Test implementation
[packages/app/tests/e2e/example.e2e.test.ts](../../../packages/app/tests/e2e/example.e2e.test.ts): `the exact title of the it(...) call`

**Notes for the reviewer:** only when the test is vague or something cannot be told from it.
```

`status` is `automated` for every scenario that has a test. The `test.it` value must match the `it(...)` title character for character (quotes escaped as in a JSON string).

## Adding a scenario with a new test

1. Write the test and its scenario in the same change. Write the scenario first if it helps: it is the review of the plan.
2. Pick the area, take the next free `NNN` in that area, create `.ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md` from the template.
3. Copy the `it` title exactly into `test.it`; set `spec.path` and `spec.ac` when the test names them.
4. Add a row to [INDEX.md](INDEX.md).
5. Run `node scripts/check-qa-scenarios.mjs` (it lists every problem at once).
6. When the test changes behaviour or its title, change the scenario in the same commit.

## Reviewing a scenario

1. Read Goal, Given, When, Then without opening the test. Does it describe a behaviour a user or operator would recognise?
2. Check that each Then step is observable and concrete (a number, a text, a status), not "works correctly".
3. Check Edge cases against the test: nothing listed that the test does not assert, nothing important missing.
4. Check Data and cleanup: does the test leave the shared e2e database as it found it, or isolate itself by unique ids?
5. Open the linked test and confirm the title matches and the assertions support the Then steps. Anything vague goes under "Notes for the reviewer" and into a follow-up.

The scenarios were written from reading the tests as they are. Where a test name promises more than it asserts, the scenario says what is asserted and the difference is in the notes.
