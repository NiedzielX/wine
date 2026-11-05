---
date: 2026-11-05
updated:
area: process
status: active
source: .ai/runs/2026-11-04-e11b-recommendation-code-close.md
promoted:
---

# Niezaznaczone kryterium akceptacji nie znaczy „niezaimplementowane”: najpierw audyt na kodzie i testach

## Kontekst
Plan produktu (E11b) opisywał dziewięć niezaznaczonych AC specyfikacji kodu polecenia jako pracę do zrobienia. Po przeczytaniu kodu okazało się, że każde z nich miało test od PR-ów F1/F2 (2026-10-18), a checkbox po prostu nigdy nie został odhaczony: wpis „Realizacja” fazy mówił „niezaznaczone”, a późniejsze PR-y dokładały testy bez wracania do listy.

## Reguła
Zanim zaplanujesz lub wycenisz „domknięcie” niezaznaczonych AC, zmapuj każde na test (`grep` po `AC<n>` w `tests/` i w `.ai/qa/`), uruchom go i dopiero potem zdecyduj, co jest naprawdę otwarte. Kto dokłada test dla AC, zaznacza je w specyfikacji w tym samym PR-ze.

## Jak sprawdzić
Spec `.ai/specs/implemented/2026-10-16-recommendation-code.md`, wpis „E11b” w „Realizacji”: tabela AC → test.
