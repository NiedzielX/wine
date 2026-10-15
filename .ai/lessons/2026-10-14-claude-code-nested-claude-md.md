---
date: 2026-10-14
updated:
area: process
status: active
source: .ai/runs/2026-10-14-monorepo-foundation.md
---

# Pakietowe zasady dla Claude Code: obok każdego `AGENTS.md` umieść `CLAUDE.md` z `@AGENTS.md`

## Kontekst
Każdy pakiet monorepo ma własny `AGENTS.md`. Codex i inne agenty czytają najbliższy `AGENTS.md`, ale Claude Code automatycznie wczytuje tylko pliki `CLAUDE.md` (główny przy starcie, zagnieżdżone przy pracy w danym katalogu).

## Reguła
- Treść zasad pisz tylko w `AGENTS.md` (jedno źródło prawdy).
- Obok każdego `AGENTS.md` utwórz `CLAUDE.md` o treści `@AGENTS.md`.
- Nowy pakiet = `AGENTS.md` + `CLAUDE.md` w tym samym przebiegu.

## Jak sprawdzić
`for d in packages/*/; do test -f "$d/AGENTS.md" && test -f "$d/CLAUDE.md" || echo "brak w $d"; done` nie wypisuje nic.
