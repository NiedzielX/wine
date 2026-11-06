---
name: om-integration-tests
description: Local override of the Open Mercato skill om-integration-tests for Wine Match: Markdown scenarios in .ai/qa are mandatory, the project's best practices always apply, and the test environment comes from the repo's own scripts.
---

# Integration tests: Wine Match local override

**Base skill first.** Read and follow `.claude/skills/om-integration-tests/SKILL.md` (and its `references/`); this file only extends it. Where the two differ, this file wins, except that the base skill's safety rules always win.

## 1. Markdown scenario is mandatory

The base skill treats the Markdown scenario as optional. In this repository it is **required**: a test is not finished without both the TypeScript test and its scenario.

- **Path and name:** `.ai/qa/{AREA}/{AREA}-{NNN}-{slug}.md` (`AREA` is one of the areas listed in `.ai/qa/README.md`, `NNN` is the next free number in that area, `slug` is a few lowercase ASCII words joined by hyphens).
- **One scenario, one business case.** One `it(...)` per scenario unless several `it`s clearly make up one case.
- **Content** (template in `.ai/qa/README.md`): front matter (`id`, `area`, `title`, `status`, `spec`, `test`), Goal, Given, When, Then, Edge cases covered, Data and cleanup, Test implementation. Write it so that a person who does not read TypeScript can review it. Describe only what the test really asserts.
- **Link both ways:** the scenario links to the `.e2e.test.ts` file and names the exact `it` title; the `it` title is the stable key, so keep it unambiguous and do not rename it without updating the scenario.
- **Index and check:** add the scenario to `.ai/qa/INDEX.md` and run `npm run check:qa` (it fails on a missing scenario, a wrong link or a bad name).

## 2. Best practices always apply

Apply `.ai/skills/om-integration-tests/references/best-practices.md` to every test you write or change. Before you finish, go through its rules once and fix violations. When you review an existing test, name the rule it breaks.

## 3. Project facts (do not rediscover them)

- **Runner:** Vitest with `packages/app/vitest.e2e.config.ts`; tests are `packages/app/tests/e2e/*.e2e.test.ts`; helpers in `support.ts`, `new-restaurant.ts`; harness in `global-setup.ts` and `@wine-match/testkit`. Run with `npm run test:e2e` (it needs `npm run build` first because it runs the BUILT app).
- **Browser:** `agent-browser` (see `.ai/browsers/agent-browser.md`), not Playwright. Do not add Playwright.
- **Environment for writing and inspecting tests:** `npm run test-env:up` (script `.ai/scripts/test-env-up.sh`) starts a disposable PostgreSQL, migrations, demo data and the built app on a free port and writes the descriptor `.ai/qa/test-env.json`; `npm run test-env:down` stops exactly what it started. Reuse a running environment instead of starting a second one. Without Docker the scripts use `TEST_DATABASE_URL`.
- **Guest pages work without JavaScript** and keep guest state only in the URL. Explore and test them through links and GET forms.
- **Demo credentials** (README) belong to the local demo only; never use them against a real instance and never write them into tracked files.
- **Time and randomness:** the service day is `serviceDay` (Europe/Warsaw, 04:00 boundary); recommendation codes come from random UUIDs. Never assert on "today" without controlling the clock, and never hard-code a value that a random generator can produce (lesson `2026-11-05-hand-picked-values-vs-random-ids`).
- **Per-test timeouts and retries** belong to the shared runner config (base skill rule); debug with retries 0 on the command line.

## 4. Done means

1. The test passes when run alone and with the whole `test:e2e` suite.
2. The scenario file exists, is linked, and is in `.ai/qa/INDEX.md`; `npm run check:qa` passes.
3. If a failure was diagnosed, the report separates application, test and environment causes with evidence, and a fix changes the cause rather than weakening the test.
4. A human reads the scenario and the test once; a green check alone does not count.
