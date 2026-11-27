---
started: 2026-11-27 16:25
ended: 2026-11-27 16:40
agent: Claude Code
spec: brak — poprawka alertu CodeQL bez zmiany kontraktu
outcome: success
related: [.ai/lessons/2026-11-27-handle-guard-contract-change-needs-contract-tests.md]
---

# Alert CodeQL „User-controlled bypass of security check” w handle()

## Zadanie
`handle()` w `packages/app/src/server/api-auth.ts` wywoływał `authorize` tylko gdy `opts.slug` (wartość z żądania) była niepusta. Trasy z `?restaurant=` bez parametru dostawały 422 od handlera, ale strażnik sam nie odmawiał.

## Przebieg
Poprzednia próba (403 przy braku sluga) łamała pięć testów kontraktu. Tym razem strażnik odpowiada sam tym samym 422 (`validation_failed`, `restaurant: required`) po 401 i sprawdzeniu CSRF, więc przy podanym `permission` nie ma ścieżki do handlera z pominięciem `authorize`. Kody odpowiedzi tras bez zmian. Dodany test w `app/tests/unit/server.test.ts`.

## Weryfikacja
`npx vitest run tests/unit` w `packages/app`: 51 plików, 684 testów, wszystkie zielone. Pełny CI (w tym e2e kontraktu 422) na PR.

## Wynik
Zmiana strażnika bez zmiany kontraktu API. Zamknięcie alertu potwierdzi ponowny skan CodeQL na `main`.

## Lekcje
Aktualizacja lekcji 2026-11-27-handle-guard-contract-change-needs-contract-tests.
