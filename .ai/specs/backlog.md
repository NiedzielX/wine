# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-15 (research tree and technical tree); E11–E22 and the status tables were added on 2026-11-08 (no issues are filed for E11–E22)
Research tree (first run): brief nie spełniał Definition of Ready (Problems i Target group to `[ASSUMPTION]`), więc backlog zawiera tylko zadania z Collection plan.

| Id | Issue | Title | Epic | Depends on | Adopted |
|---|---|---|---|---|---|
| E01 | #3 | Discovery: evidence before the pilot | — | — | no |
| E01-T01 | #4 | Find out how premium restaurants choose wine today and where sales are lost | #3 | — | no |
| E01-T02 | #5 | Find out how guests choose wine when nobody advises them | #3 | — | no |
| E01-T03 | #6 | Get the current Wine Attach Rate from a candidate pilot restaurant's POS | #3 | E01-T06 | no |
| E01-T04 | #7 | Benchmark digital wine lists and pairing apps restaurants already know | #3 | — | no |
| E01-T05 | #8 | Find out how and how much restaurants pay for similar tools | #3 | — | no |
| E01-T06 | #9 | Agree a pilot with one restaurant | #3 | E01-T01, E01-T05 | no |

## Technical backlog (D09)

Brief refreshed on 2026-10-15: product owner accepted business assumptions A01–A06 untested and waived the evidence requirement for the Now scope (D09). The research tasks above stay open and run in parallel.

| Id | Issue | Title | Epic / Story | Depends on | Adopted |
|---|---|---|---|---|---|
| E02 | #11 | Guest and staff usage events | — | — | no |
| E02-S01 | #12 | A guest's visit, dish views and recommendation views are recorded without JavaScript | #11 | — | no |
| E02-S02 | #13 | A guest's wine selection and showing it to the waiter are recorded | #11 | E02-S01 | no |
| E02-S03 | #14 | A waiter's lookups in the staff view are recorded separately from guests | #11 | E02-S01 | no |
| E03 | #15 | POS sales import and Wine Attach Rate | — | — | no |
| E03-S01 | #16 | A manager can upload a POS sales export and review it before saving | #15 | — | no |
| E03-S01-T01 | #17 | Add the sales record table and migration | #16 | — | no |
| E03-S02 | #18 | Wine Attach Rate is calculated for a chosen period | #15 | E03-S01 | no |
| E04 | #19 | KPI dashboard in the panel | — | — | no |
| E04-S01 | #20 | A manager sees guest usage KPIs for the last 28 days | #19 | E02-S02 | no |
| E04-S02 | #21 | A manager sees sales KPIs once a POS export is uploaded | #19 | E03-S02 | no |
| E04-S03 | #22 | A sommelier sees which pairings guests choose | #19 | E02-S02 | no |
| E05 | #23 | Pilot readiness: hosting and restaurant setup | — | — | no |
| E05-S01 | #24 | A maintainer can create a restaurant and its first owner without demo data | #23 | — | no |
| E05-S02 | #25 | A maintainer can deploy Wine Match to production reproducibly | #23 | — | no |
| E06 | #26 | Later (parked) | — | — | no |

## Product direction 2026-10-16 (D13–D18)

Positioning accepted by the product owner on 2026-10-16. Specs approved by the product owner on 2026-10-16; issues filed the same day.

| Id | Issue | Title | Spec | Depends on | Adopted |
|---|---|---|---|---|---|
| E07 | #36 | How it works: explanations and the "i" disclosure on every engine screen | .ai/specs/2026-10-16-how-it-works-explanations.md | — | no |
| E08 | #41 | Whole table: the differentiator and the waiter path | .ai/specs/implemented/2026-10-16-whole-table-waiter-path.md | E07 F1a/F1b, E02 F1 | no |
| E09 | #46 | Recommendation code ("show the waiter: W7K") and sales attribution without POS integration | .ai/specs/implemented/2026-10-16-recommendation-code.md | E02 F1–F2; E03 F2 for phase 3 | no |
| E10 | #50 | Opportunities in the sommelier panel (no POS in the MVP) | .ai/specs/implemented/2026-10-16-sommelier-opportunities.md | E07 F1b; E02/E04 F3 for S4; E09 F1 for S5 | no |

- Phases: E07-F1a #37 · E07-F1b #38 · E07-F2 #39 · E07-F3 #40
- Phases: E08-F1 #42 · E08-F2 #43 · E08-F3 #44 · E08-F4 #45
- Phases: E09-F1 #47 · E09-F2 #48 · E09-F3 #49
- Phases: E10-F1 #51 · E10-F2 #52 · E10-F3 #53 · E10-F4 #54

Merge order: E07 F1a (core) → E08 F1 (engine) → E07 F1b (UI) → E09 F1 → E08 F2–F3, E10 F1–F2 → the rest by dependency.

## Product completion plan 2026-11-04 (E11–E22)

Source: `.ai/specs/2026-11-04-product-completion-plan.md` (decision D19: no validation of A01–A06 before building). Status refreshed on 2026-11-08 from the merged pull requests (`gh api repos/NiedzielX/wine/pulls?state=closed`, GET only) and the spec frontmatter. Ids are stable: E11 and E11b are the plan's names for existing specs, E12–E22 follow the plan.

`Adopted` here means "an issue that already existed was taken into this backlog instead of filing a new one". **No GitHub issue has been filed for E11–E22** (the highest issue number is #95), so the column is `no` everywhere; two issues that pre-date the plan belong to E20 (#89 and #90, both closed) and E05-S02 (#25) is the issue behind E11. Phases are separate pull requests; "F1 #120" means phase 1 was merged as PR #120.

| Id | Issue | Title | Spec (status) | Phases | Merged so far | Not started | Depends on | Adopted |
|---|---|---|---|---|---|---|---|---|
| E11 | #25 (E05-S02) | Production deployment (Dockerfile, CI image job, runbook, hosting) | `.ai/specs/2026-10-15-production-deployment.md` (in-progress) | F1–F3 | F1 #120 (health endpoint, fail-closed `PUBLIC_BASE_URL`, seeder guard, `smoke --production`) | F2 (image, CI `image` job), F3 (runbook `docs/DEPLOYMENT.md`, hosting) | — | no |
| E11b | — | Recommendation code close-out (AC1–AC6, AC13–AC15) | `.ai/specs/implemented/2026-10-16-recommendation-code.md` (implemented) | one PR | #116 | — (done) | — | no |
| E12 | — | Staff accounts, waiter PIN and roles | `.ai/specs/2026-11-04-staff-accounts-and-roles.md` (in-progress) | F1–F6 | F1 #118 (member status, auth events, team service, A15), F2 #123 (invitations, A17, reserved slugs) and #125 (`npm run user:invite`) | F3 (account, sessions), F4 (password reset), F5 (waiter PIN), F6 | — | no |
| E13 | — | Panel completion (profile editing, publication history, scheduled publications, seasonal sets) | `.ai/specs/2026-11-04-panel-completion.md` (approved) | F1–F6 | — | all | E12 permissions table | no |
| E14 | — | Platform admin, organizations, multi-venue | `.ai/specs/2026-11-04-platform-admin-and-multi-venue.md` (approved) | F1–F5 | — | all | E12 | no |
| E15 | — | Subscriptions and billing | `.ai/specs/2026-11-04-subscriptions-and-billing.md` (approved) | F1–F7 | — | all | E12, E14 | no |
| E16 | — | Engine v1.x: rule calibration and table optimization | `.ai/specs/2026-11-04-engine-v1x-calibration-and-table-optimization.md` (approved) | F1–F6 | — | all | — | no |
| E17 | — | Learning layer: dataset, shadow model, offline evaluation | `.ai/specs/2026-11-04-learning-layer-shadow-model.md` (approved) | F1–F4 | — | all | E16, E11b, E19 | no |
| E18 | — | Guest experience: tasting menu, reverse pairing, diets, feedback | `.ai/specs/2026-11-04-guest-experience-completion.md` (approved) | F1–F7 | — | all | E13 F1 | no |
| E19 | — | Restaurant operations: availability, wines to sell, branding, QR kit | `.ai/specs/2026-11-04-restaurant-operations.md` (approved) | F1–F5 (F5 conditional) | — | all | E13 | no |
| E20 | #89, #90 (pre-existing, closed) | Data and import: OCR, CSV export, slug alias, multiple codes, `itemName` cleanup | `.ai/specs/2026-11-04-data-and-import-completion.md` (approved) | F1–F6 | none as E20 phases; #90 was fixed earlier by #92 and #89 is closed | all | E11b, E11, E12 | no |
| E21 | — | Platform quality and compliance (monitoring, backups, rate limits, accessibility, performance, GDPR) | `.ai/specs/2026-11-04-platform-quality-and-compliance.md` (in-progress) | F1–F7 | F1 #117 (metrics endpoint, one log line per request, redaction) | F2–F7 | E11 (F2 after E11 F1) | no |
| E22 | — | Sales demo and ROI calculator | `.ai/specs/2026-11-04-sales-demo-and-roi-calculator.md` (in-progress) | F1–F4 | F1 #122 (calculator, `SHOWCASE_MODE=calculator`), F2 #126 (demo guide, read-only `SHOWCASE_MODE=demo`) | F3, F4 | E11, E12 F5, E15, E19 (per phase) | no |

Merged work outside epic phases (process, security, quality): #127 threat model and access-boundary tests, #128 `check:routes`, #129 review protocol, #112 tenant-isolation e2e (closes #95), #109 non-UUID id handling, #110 regression proof script, #115 PreToolUse hook fix. Open at the time of writing: #130 (QA protocol).

## Status of E01–E10 on 2026-11-08

| Epic | Status | Evidence (merged PRs) |
|---|---|---|
| E01 Discovery | not done: no interview, benchmark, price or POS evidence collected | #10 (brief and research backlog), #103 (desk-research leads; the brief says they do not count as evidence); D19 lets E01 run in parallel without blocking |
| E02 Usage events | done | #61 (F1), #63 (F2, F3) |
| E03 POS sales import | done | #73 (F1), #75 (F2), #91 (check fix) |
| E04 KPI dashboard | done | #72 (S01), #87 (S02), #74 (S03) |
| E05 Pilot readiness | S01 done (#98); S02 partial (E11 F1 #120, F2 and F3 open) | #98, #120 |
| E06 Later | parked placeholder | — |
| E07 How it works | done | #55 (F1a), #57 (F1b), #66 and #67 (F2), #59 (F3) |
| E08 Whole table | done | #56 (F1), #68 (F2), #64 (F3), #70 (F4) |
| E09 Recommendation code | done | #65 (F1), #71 (F2), #88 (F3), #116 (close-out) |
| E10 Opportunities | done | #58 (F1), #62 (F2), #76 (F3), #69 (F4) |

## GitHub issues that look closable (nothing was closed)

This list is evidence for the owner; no issue was changed. Checked with `gh issue list` on 2026-11-08.

| Issue | Verdict | Evidence |
|---|---|---|
| #46 E09 epic (open) | closable | phases #47, #48, #49 are closed; PRs #65, #71, #88; spec in `implemented/`; #116 closed the remaining acceptance criteria |
| #19 E04 epic (open) | closable | stories #20, #21, #22 are closed; PRs #72, #87, #74; spec in `implemented/` |
| #23 E05 epic (open) | not closable yet | S01 #24 is closed (PR #98) but S02 #25 is open |
| #25 E05-S02 deploy (open) | not closable yet | only E11 F1 (#120) is merged; the image, CI `image` job and runbook (E11 F2 and F3) are not |
| #3 E01 and #4–#9 E01-T01…T06 (open) | not closable as "done" | no evidence that any research task was carried out: #10 and #103 only filed and refreshed the backlog and collected unverified leads. They can be closed only by an owner decision, for example "not planned, superseded by D19", or kept open because D19 allows them to run in parallel |
| #26 E06 Later (open) | keep open | parked placeholder with no work behind it |
| #89, #90, #95, #60 | already closed | #92 (#90), #112 (#95), #96 (#60) |
