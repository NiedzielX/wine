---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: brak — zmiana procesu, nie funkcji produktu
outcome: success
related: [.ai/runs/2026-10-14-mvp-mockups.md]
---

# Wprowadzenie struktury `.ai/` oraz plików AGENTS.md i CLAUDE.md

## Zadanie
Utworzyć `AGENTS.md`, `CLAUDE.md` i katalog `.ai/` (specs z `implemented/` i `archive/`, runs, lessons.md, lessons/) z konwencją nazw `YYYY-MM-DD-slug.md` oraz instrukcjami wymuszającymi korzystanie z tej struktury.

## Przebieg
1. Sprawdzono, że żaden z plików ani katalog `.ai/` jeszcze nie istnieje.
2. `AGENTS.md` jako jedyne źródło zasad: struktura, konwencja nazw, cykl życia specyfikacji (tylko człowiek zatwierdza `approved`, agent nie implementuje draftów), obowiązek logu przy pracy autonomicznej, kryteria zapisu lekcji, szablony, obowiązkowa kolejność pracy, niełamalne zasady projektu.
3. `CLAUDE.md` importuje `AGENTS.md` (`@AGENTS.md`) i powtarza skrót reguł oraz zasady specyficzne dla Claude Code.
4. Zasilono strukturę realnymi danymi: 4 lekcje z dotychczasowej pracy, retrospektywna specyfikacja MVP w `specs/implemented/`, retrospektywny log MVP i ten log.
5. Dodano `.gitkeep` w pustym `specs/archive/`.

## Weryfikacja
- Wszystkie pliki w `.ai/specs`, `.ai/runs`, `.ai/lessons` mają nazwy zgodne z `^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$`.
- Linki w `.ai/lessons.md` wskazują istniejące pliki.
- Build i testy bez zmian (zmiana nie dotyka kodu).

## Wynik
Struktura gotowa; nowe przebiegi muszą stosować `AGENTS.md`.

## Lekcje
Brak.
