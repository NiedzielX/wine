---
date: 2026-11-15
updated:
area: process
status: active
source: .ai/runs/2026-11-15-deployment-maintenance-rules.md
promoted:
---

# Status dokumentu to miejsce pliku i jedno pole `status`; bez indeksu wiedzy i metadanych przeglądu

## Kontekst
Lekcja 25 kursu odrzuca dwa sposoby pilnowania aktualności wiedzy: osobny indeks plików z właścicielem i datą ważności oraz pola przeglądu w nagłówku każdej specyfikacji, skilla i lekcji. Wybiera strukturę katalogów (aktywne, `implemented/`, `archive/`) i cotygodniowy przegląd. Przy przenoszeniu na Wine Match trzeba było rozstrzygnąć, co z polem `status`.

## Przyczyna
Każdy dodatkowy plik lub pole trzeba utrzymywać przy każdej zmianie i rozjeżdża się z kodem tak samo jak dokumentacja; autora i daty zmian zna git. U nas jedno pole jest jednak potrzebne: hook `.claude/hooks/spec-status-guard.mjs` czyta `status` z nagłówka, żeby agent nie ustawił `approved`.

## Reguła
- Status specyfikacji wynika z katalogu i z pola `status` (jedyne pole stanu w nagłówku; cykl w `AGENTS.md` §3).
- Nie twórz indeksu wiedzy ani pól `reviewed`, `owner_review`, `next_review` w nagłówkach; właściciela i datę sprawdzasz przez `git log` i `git blame`.
- Zgodność treści z kodem sprawdza przegląd (propozycja: playbook §8.2), nie statyczny check.

## Jak sprawdzić
`npm run check:context` i `npm run audit:process` (CTX-03, PROC-04); w nagłówkach specyfikacji nie ma pól przeglądu.
