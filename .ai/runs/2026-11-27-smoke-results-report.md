---
started: 2026-11-27 12:35
ended: 2026-11-27 12:55
agent: Claude Code
spec: brak — drobna poprawka (rozszerzenie skryptu smoke o odczyty raportu wyników, spec 2026-11-18-owner-proof-report)
outcome: success
related: []
---

# Smoke: raport wyników (A33, A34, API proof-report i proof-launch)

## Zadanie
Dodać do `scripts/smoke.mjs` sprawdzenia raportu wyników: same odczyty i odmowy, bez zmiany danych. Bez push i bez PR (`scripts/` jest pod CODEOWNERS).

## Przebieg
- Gałąź `feat/smoke-results-report` z `origin/feat/results-report-s7-final`.
- Nowa sekcja wstawiona przed „sign out”, w stylu sekcji wyborów restauracji i widoczności dania (`check()` + `expect()`).
- Dane demo nie mają dnia uruchomienia ani importu sprzedaży, więc A33 i A34 pokazują stany „Set the launch day first”. Element wydruku (`data-print-controls`, przycisk) i zdanie o Ctrl/Cmd+P renderują się dopiero przy raporcie z danymi; ustawienie dnia uruchomienia byłoby zapisem, więc smoke ich nie sprawdza (pokrywa je `proof-report.e2e.test.ts`). Smoke pilnuje natomiast, że w stanie pustym nie ma `data-print-button`.
- Dowód „bez zmian”: odczyt raportu przed odmowami (ETag i pełny obiekt `launch`) porównany z odczytem po odmowach POST (401 bez sesji, 403 bez CSRF).

## Weryfikacja
- `npx -y npm@11.6.2 ci --engine-strict=false`, potem `git checkout package-lock.json`.
- `npm run lint`: bez ostrzeżeń. `npm run typecheck`: bez błędów. `npm run build`: zakończony.
- Aplikacja zbudowana, start z `DATA_SOURCE=memory ALLOW_DEMO_DATA=true AUTH_COOKIE_SECURE=false ALLOW_LOCAL_BASE_URL=true`, port 3417: `node scripts/smoke.mjs http://localhost:3417 halka`: 321 ok, 0 FAIL, „All smoke checks passed”, 14 wierszy z A33/A34/proof.
- Mutacja: oczekiwany napis `>Results report</h1>` zmieniony na `>Results reportX</h1>`: czerwono („missing”), po przywróceniu plik bajtowo identyczny (`cmp`), zielono.
- Uwaga: limit logowań (429) działa na proces serwera; kolejne uruchomienie smoke na tym samym procesie pada na logowaniu. Przed każdym uruchomieniem restartuj serwer (zabij `next-server`, nie tylko `next start`).
- Serwer zatrzymany po testach.

## Wynik
Działa. Niezweryfikowane smokiem: treść raportu z danymi, element wydruku i zdanie Ctrl/Cmd+P (wymagają zapisu dnia uruchomienia), `postgres`.

## Lekcje
brak
