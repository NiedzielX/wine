---
name: wine-match-engine-rule
description: Add or change a rule, weight, threshold or affinity of the Wine Match recommendation engine (packages/core/src/engine) without breaking the project invariants - named rule, deterministic, unit test, golden snapshot review, docs entry, engine:matrix, sommelier over model. Use when asked to "add an engine rule", "change a pairing weight/threshold", "tune the score", "update the golden snapshot", or in Polish "dodaj regułę silnika", "zmień wagę/próg", "popraw dopasowanie win", "zaktualizuj snapshot złoty", "kalibracja silnika". Not for guest UI wording or API routes.
---

# Wine Match: engine rule

The engine is pure TypeScript shared by browser, server and tests. A rule change moves rankings that guests and sommeliers see, so it goes through a spec and a fixed checklist. The rules live in `AGENTS.md` §3 and §7; this skill is the order of work.

## Before you start
1. Read `.ai/lessons.md`, `packages/core/AGENTS.md`, `docs/RECOMMENDATION_ENGINE.md` (§4 rules, §5 sommelier layer, §10 determinism and version history) and `BACKWARD_COMPATIBILITY.md` §7.
2. A change of rules, weights or thresholds needs a spec (`AGENTS.md` §3): find it in `.ai/specs/` (also `implemented/`). Only `approved` or `in-progress` may be implemented. If there is none, write a `draft` (`.ai/docs/process-templates.md`), log it in `.ai/runs/` and stop. You never set `status: approved` yourself (the hook `.claude/hooks/spec-status-guard.mjs` refuses it).
3. Open a run log `.ai/runs/YYYY-MM-DD-slug.md` (`AGENTS.md` §4).

## Steps
1. **Name the rule.** Factors are `{rule, delta, why}` built by `add()` in `packages/core/src/engine/scoring.ts`; the id is dotted lower case (`acid.cuts_fat`, `affinity.<protein>`). `why` is a `{ en, pl }` pair written next to the rule (a rule without Polish text does not compile). Existing ids are a contract (`BACKWARD_COMPATIBILITY.md` §7): never rename or reuse one.
2. **Keep it deterministic.** In `packages/core/src/engine/` no `Math.random`, no `Date`, no network, no LLM call, no `node:*`. Ties are broken explicitly (by `wine.id`). Numbers that describe behaviour are named constants (`packages/core/src/engine/facts.ts`, `ENGINE_FACTS`).
3. **Test first (red).** Add a case to `packages/core/tests/engine.test.ts` that fails without the rule: the rule appears in `pairingScore(...).factors` with the expected delta, plus a neighbouring case where it must not fire. Run `npm test -w @wine-match/core` and see it red for the right reason.
4. **Implement**, then run the same test green, plus `packages/core/tests/engine-golden.test.ts`.
5. **Golden snapshots.** `engine-golden.test.ts` pins `recommendForDish` and `recommendForTable` for every demo dish and 18 preference sets in `packages/core/tests/__snapshots__/engine-golden.*.txt`. If it fails, do not update blindly: read the diff as a sommelier (is every moved wine plausible, did a sommelier-approved pair lose its place?). Only then run `npx vitest run tests/engine-golden.test.ts -u` inside `packages/core`, and put a summary of the diff (which dishes, which wines, which direction) in the run log and the PR. A rule meant to change nothing leaves the snapshots byte-identical.
6. **Version.** Results changed: raise `ENGINE_VERSION` in `scoring.ts` (minor for a new rule, major for a scale change or a removed rule), add a row to the history table in `docs/RECOMMENDATION_ENGINE.md` §10 and update `BACKWARD_COMPATIBILITY.md` §7, which names the current version.
7. **Docs.** Add the rule to the table in `docs/RECOMMENDATION_ENGINE.md` §4 (condition, delta) in the same change; fix the test-count line at the top of that file.
8. **Calibration.** Run `npm run engine:matrix` (script `packages/core/scripts/engine-matrix.ts`) and review the best wines per demo dish with a sommelier's eye. Put the relevant lines in the PR description.

## Invariants to re-check (sommelier over model)
- The label "Para sommeliera" / "Sommelier's pairing" appears only for pairs with status `approved` or `modified` (brief R06). The best engine suggestion is "Polecane do Twojego dania" / "Recommended for your dish" with no seal. See tiers in `packages/core/src/engine/recommend.ts` and the dictionaries `packages/app/src/i18n/pl.ts` and `en.ts`.
- The displayed Match Score is always the engine's `matchScore`. Sommelier boost, preferences and price change the order (`rankScore`), never the displayed number. A new rule must not read price or sommelier status into `pairingScore`.
- Rejected pairs stay excluded; approved pairs keep tiers 0 and 1.
- No "AI" wording in guest-facing text ("AI recommendation", "Ask AI", "Powered by AI"); `why` texts talk about wine and food only.

## Done when
- [ ] Spec is `approved` or `in-progress` (set by a human) and linked in the run log.
- [ ] Rule has a unique dotted name and `{ en, pl }` texts.
- [ ] No `Math.random`, dates, network or LLM in `packages/core/src/engine/` (`grep -rnE "Math\.random|Date|fetch" packages/core/src/engine`).
- [ ] New test in `packages/core/tests/engine.test.ts` was red before the change and green after.
- [ ] Golden diff reviewed and described; snapshots changed only when intended.
- [ ] `ENGINE_VERSION` and its history row updated when results moved.
- [ ] `docs/RECOMMENDATION_ENGINE.md` has the rule.
- [ ] `npm run engine:matrix` output reviewed.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` pass (`AGENTS.md` §6.1); `npm run test:db` too if services or ports changed.
- [ ] Run log has commands and results; a lesson if the cause or the tuning was not obvious.

## Do not
- Do not set `status: approved` on a spec, or implement a `draft`.
- Do not run `-u` on the snapshots to turn a red test green without reading the diff.
- Do not change the displayed score, add price or margin to `pairingScore`, or boost non-approved pairs.
- Do not rename or remove an existing `rule` id, or change the 0-99 scale or `BASE_SCORE`.
- Do not call an LLM, the network or the clock from the engine (LLMs are only for one-off import steps, `docs/RECOMMENDATION_ENGINE.md` §11).
- Do not read `.env` files or other secrets; configuration is documented in `.env.example`.
