---
started: 2026-11-05 15:00
ended: 2026-11-05 16:30
agent: Claude Code / claude-sonnet-5-5 (testy ręczne: pod-agent w świeżej sesji)
spec: brak — poprawka błędu znalezionego w teście ręcznym (lekcja 14)
outcome: success
related: [.ai/lessons/2026-11-05-url-ids-vs-uuid-columns.md]
---

# Szukanie błędów jak użytkownik: id spoza UUID daje 500

## Zadanie
Zadanie domowe z lekcji 14: przetestować aplikację od strony użytkownika, znaleźć 1–2 błędy na przypadkach brzegowych, naprawić z dowodem „czerwony przed, zielony po”, review drugim agentem.

## Przebieg
- Aplikacja zbudowana lokalnie (`npm run test-env:up`, PostgreSQL bez Dockera). Brak przeglądarki, więc testy przez HTTP.
- Pod-agent w świeżej sesji (bez kontekstu) szukał błędów w pustych stanach, granicach, czasie, pieniądzach i uprawnieniach; zgłosił jeden błąd: 500 dla id niebędącego UUID-em. Zgłoszenie odtworzyłem samodzielnie (5 adresów, 4 × 500), zanim cokolwiek poprawiłem.
- Przyczyna: repozytoria PostgreSQL przekazują id do kolumny uuid (`22P02`); w logu aplikacji ten sam błąd sterownika.
- Test najpierw: przypadek w `repositoryContract`; czerwony na PostgreSQL z komunikatem `invalid input syntax for type uuid: "abc"`, potem poprawka (`isUuid` w trzech repozytoriach i `listByDish`).

## Weryfikacja
- `verify:regression` (test czerwony na `origin/main`, zielony na gałęzi): wynik w opisie PR.
- Aplikacja po przebudowie: `/r/halka/wine/abc`, `/dish/abc/wines`, `/selected/abc` i `/api/v1/dishes/abc/recommendations` odpowiadają 404 zamiast 500; poprawne id nadal działa.

## Wynik
Jeden błąd znaleziony i naprawiony. Nie sprawdzono: zapisy i `expectedVersion`, granica 04:00 dnia serwisowego, macierz ról kelner/manager/sommelier, scenariusz w przeglądarce (brak `agent-browser`).

## Lekcje
[2026-11-05-url-ids-vs-uuid-columns.md](../lessons/2026-11-05-url-ids-vs-uuid-columns.md)
