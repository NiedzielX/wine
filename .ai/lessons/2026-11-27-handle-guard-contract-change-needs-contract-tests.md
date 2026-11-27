---
date: 2026-11-27
updated:
area: tooling
status: active
source: .ai/runs/2026-11-27-orchestration-session.md
promoted:
---

# Alertu CodeQL o obejściu kontroli nie zamykaj zmianą kontraktu `handle()` bez sprawdzenia testów kontraktowych

## Kontekst
Alert CodeQL „User-controlled bypass of security check” dotyczył strażnika `handle()` w `packages/app/src/server/api-auth.ts`. Próba: uprawnienie bez sluga restauracji daje 403. Zmiana złamała pięć istniejących testów.

## Przyczyna
Trasy z brakującym parametrem `restaurant` zwracały dotąd 422 z walidacji: handler waliduje wejście i nie rusza danych. Testy kontraktowe utrwalają ten kod odpowiedzi, więc zmiana semantyki strażnika zmienia kontrakt API, a nie tylko zamyka alert.

## Reguła
Przed zmianą semantyki `handle()` uruchom testy tras i sprawdź, które kody odpowiedzi się zmienią. Zmiana kontraktu (422 na 403) to decyzja o zachowaniu API (specyfikacja, `docs/API_SPECIFICATION.md`), nie poprawka alertu. Gdy handler nie dotyka danych przed walidacją, uzasadnij to przy zamykaniu alertu zamiast zmieniać kod odpowiedzi.

## Jak sprawdzić
`npm test -w @wine-match/app` przed i po zmianie strażnika; lista zmienionych kodów odpowiedzi jest pusta albo opisana w specyfikacji.
