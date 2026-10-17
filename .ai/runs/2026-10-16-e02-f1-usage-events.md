---
started: 2026-10-16 17:28
ended:
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-15-guest-usage-events.md
outcome:
related: [issue #12, epic #11]
---

# E02 faza 1: sesja gościa w URL (`sid`), port i repozytoria zdarzeń, zapis odsłon G0–G3

## Zadanie
Zaimplementować wyłącznie fazę 1 specyfikacji E02 (issue #12): `sid` w każdym linku i formularzu gościa i G9,
`GuestInteractionRepository` (pamięć + PostgreSQL + kontrakt), `UsageEventService`, `trackUsage` w `after()`,
filtr `shouldRecord` (prefetch, nagłówek `x-wine-match-synthetic: 1`, boty), zdarzenia G0, G1, G3, nagłówek w smoke,
docs (R9). Gałąź `feat/e02-f1-usage-events` z `origin/main`, PR bez merge.

## Przebieg
