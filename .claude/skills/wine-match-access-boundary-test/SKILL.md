---
name: wine-match-access-boundary-test
description: Write the three-checks HTTP test for a new Wine Match access boundary (tenant isolation by slug or object id, role hierarchy, invitation or token, read-only showcase, any new door someone is locked out of) per engineering-standards section 10 - positive control for both accounts, refused read and write, whole-payload and table-digest state after the attempt, mutation proof - plus the QA scenario, threat-model row and run-log evidence card. Use when asked to "test the boundary", "add a tenant isolation test", "prove this route is closed", or in Polish "test granicy dostępu", "izolacja tenantów", "test trzech sprawdzeń", "dowód że odmowa nic nie zmieniła", "dodaj wiersz do modelu zagrożeń".
---

# Wine Match: access boundary test

"403" alone proves nothing: the call may be broken, or the write may have happened anyway. A boundary counts as checked only with the parts of `.ai/docs/engineering-standards.md` §10 (summary in `AGENTS.md` §6.1). The reference implementation is `packages/app/tests/e2e/access-boundaries.e2e.test.ts`: copy its helpers instead of inventing new ones.

## Before you start
1. Read `.ai/lessons.md`, `.ai/lessons/2026-11-07-access-boundary-three-checks.md`, `docs/security/threat-model.md` (§4 table; T-01 to T-03 are the model rows), `.ai/docs/engineering-standards.md` §10 and `.ai/qa/README.md`.
2. Open a run log (`AGENTS.md` §4). If the test finds a real hole, fix it starting from the red test (`npm run verify:regression -- <test>`, `.ai/docs/fix-verification.md`).

## Where things go
| What | Path |
|---|---|
| Test (extend the existing file for the same family of boundary, otherwise a new file) | `packages/app/tests/e2e/access-boundaries.e2e.test.ts` or `packages/app/tests/e2e/<topic>.e2e.test.ts` |
| Second restaurant and its accounts | `packages/app/tests/e2e/new-restaurant.ts` (`NEW_RESTAURANT`, `NEW_RESTAURANT_TEAM`); demo restaurant `halka` with `DEMO_PASSWORD` from `@wine-match/core` |
| Database digest | `queryDatabase` from `@wine-match/testkit` |
| QA scenario | `.ai/qa/security/security-NNN-slug.md` (next free number; template in `.ai/qa/README.md`) plus a row in `.ai/qa/INDEX.md` |
| Threat-model row | `docs/security/threat-model.md` §4 (new `T-NN`; ids are never reused) |
| Evidence | run log `.ai/runs/YYYY-MM-DD-slug.md`, section "Karta dowodu" (example: `.ai/runs/2026-11-07-check-routes.md`) |

## The test, in order (one `it` per boundary)
1. **Setup.** Sign in real accounts of two restaurants (Halka and Bistro E2E) with plain `fetch` against the built app (`inject('e2e').baseUrl`), with the CSRF header and `origin` on writes. Create the objects the attempt needs and delete them in `afterAll`.
2. **Positive control for BOTH sides.** The very call that will be refused works for the owner of the data, A on A's object and B on B's object (200, 201 or 204). Without it a 404 may only mean a broken call.
3. **State before.** Read whole payloads of both restaurants (list and detail endpoints, as text) and a digest per table the attempt could touch: `select coalesce(md5(string_agg(x::text, '|' order by x::text)), 'empty') from <table> x`. Reuse `TABLES` and `digest()` of the reference file and add tables you introduce.
4. **Refused read.** The foreign account reads the foreign object: 403 for another restaurant's slug, 404 for another restaurant's object id under its own slug. The body contains no value from the other side's data (assert on names and e-mails you seeded).
5. **Refused write.** Every write method (POST, PATCH, DELETE, whatever the route has) with a foreign id or too low a role: 403, 404 or 422, never 2xx. Include a body with a field outside the schema where the route has one (`strictObject` answers 422 `unknown_field`).
6. **State after.** Whole payloads equal to "before", and every table digest equal. Not counters.
7. **Mutation proof.** Break the control on purpose (remove the `restaurant` filter in the repository, force a role, drop the check), rerun and watch the test fail for the right reason, then restore. Record before and after output in the run log. A test that cannot fail is not evidence.

Start the `it` title with the threat id (`T-05: ...`). The scenario's front matter `test.it` must equal the `it(...)` title exactly (`npm run check:qa` enforces the link).

## Documentation and evidence
- QA scenario with `status: automated`, `area: security`, Given/When/Then, only edge cases the test really asserts, data and cleanup.
- Threat model: a new route with an id in its path, a new role or a new public entry adds a row in the same PR (`engineering-standards.md` §10): asset, STRIDE letters, control today with file:line you actually opened, covering test.
- Run log "Karta dowodu": hypothesis, scope and risk, base commit, environment, command, expected, actual red (mutation), actual green, what it does NOT prove, decision and owner.

## Commands
`npm run build`, then `npm run test:e2e` (PostgreSQL through testcontainers or `TEST_DATABASE_URL`, and `agent-browser` in `PATH`; see `.ai/docs/commands.md`). Also `npm run check:qa`, `npm run lint`, `npm run typecheck`.

## Done when
- [ ] Positive control passes for both accounts, both directions.
- [ ] Refused read and every refused write asserted by status and absence of foreign data.
- [ ] Whole payloads and table digests are equal before and after.
- [ ] Mutation turned the test red and was restored; evidence in the run log.
- [ ] Scenario file and `INDEX.md` row exist; `npm run check:qa` is green.
- [ ] Threat-model row added or updated, no id reused.
- [ ] Evidence card in the run log.

## Do not
- Do not accept a test with only a refusal, or with counts instead of payloads and digests.
- Do not point the test at a real or shared deployment; only the built test app and its own database.
- Do not hard-code passwords; use the exported demo constants and `new-restaurant.ts`.
- Do not skip the mutation step because the test "obviously" works.
- Do not weaken an existing boundary test to make a change pass.
- Do not read `.env` files or secrets; the e2e setup injects the database URL.
