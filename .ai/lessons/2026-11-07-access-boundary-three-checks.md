---
date: 2026-11-07
updated:
area: process
status: active
source: .ai/runs/2026-11-07-lesson-16-security.md
promoted: AGENTS.md §6.1
---

# Granica dostępu jest sprawdzona dopiero z kontrolą pozytywną dla obu kont, odmową odczytu i zapisu oraz stanem po próbie

## Kontekst
Przegląd bezpieczeństwa (lekcja 16) trzech granic: izolacja tenantów po id obiektu, hierarchia ról, zaproszenia. Istniejące testy sprawdzały odmowę na poziomie sluga (403) i hierarchię, ale nie id obiektu innej restauracji pod własnym slugiem i nie to, czy po odmowie cokolwiek się zmieniło.

## Przyczyna
Odmowa 403/404 sama nie dowodzi granicy: wywołanie mogło być zepsute (zła ścieżka, brak CSRF), a zapis mógł się wykonać mimo błędu. Test, który nie umie zapaść, nic nie waży (dowód: usunięcie filtra `restaurant` w `PgImportRepository.find` zrobiło `access-boundaries` czerwonym).

## Reguła
Test granicy ma cztery części: kontrola pozytywna dla obu stron (A→B i B→A), odmowa odczytu, odmowa zapisu (każda metoda), stan po próbie (całe ładunki obu restauracji plus skrót wierszy tabel, nie liczniki). Szablon: `packages/app/tests/e2e/access-boundaries.e2e.test.ts`; pełny opis: `.ai/docs/engineering-standards.md` §10. Po dodaniu kontroli zepsuj ją na chwilę i potwierdź czerwony test.

## Jak sprawdzić
`npm run test:e2e` (plik `access-boundaries`); mutacja z logu przebiegu `.ai/runs/2026-11-07-lesson-16-security.md`.
