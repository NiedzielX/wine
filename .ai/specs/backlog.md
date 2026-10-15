# Backlogs

## .ai/specs/product-brief.md
Backlog source: .ai/specs/product-brief.md
Last filed: 2026-10-15 (research tree and technical tree)
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
