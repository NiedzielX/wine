---
started: 2026-11-05 12:00
ended: 2026-11-05 12:40
agent: Claude Code / claude-sonnet-5-5
spec: brak — poprawka niestabilnego testu
outcome: success
related: [.ai/lessons/2026-11-05-hand-picked-values-vs-random-ids.md]
---

# Naprawa niestabilnego testu `staff-code.test.ts` (AC8)

## Zadanie
Właściciel polecił poprawić niestabilny test z CI (PR #87), zgodnie z lekcją 12 o flaky tests.

## Przebieg
- Hipoteza z lekcji (zależność od czasu) nie potwierdziła się: serviceDay(now − 24 h) nie może dać dzisiejszego dnia poza zmianą czasu, a CI biegło 22 października.
- Przyczyna: losowe UUID-y kodów mogą dać kod wpisany w teście na sztywno (`H8H`). Odtworzone celowo na oryginalnym teście z `main`: ten sam komunikat błędu co na CI.
- Poprawka: serwis testowy dostaje `idGenerator`, który omija kody wpisane ręcznie, plus test samego generatora (20 000 prób).

## Weryfikacja
- `staff-code.test.ts`: 9 przeszło (w tym nowy test generatora).
- `npm run typecheck`, `npm run lint`: bez błędów.
- Odtworzenie awarii na oryginalnym teście: wymuszony `H8H` daje `marked=undone` zamiast `codeError=not_found`.

## Wynik
Test nie zależy już od losu. Inne testy w repozytorium z literałami przy losowych id nie były przeglądane.

## Lekcje
[2026-11-05-hand-picked-values-vs-random-ids.md](../lessons/2026-11-05-hand-picked-values-vs-random-ids.md)
