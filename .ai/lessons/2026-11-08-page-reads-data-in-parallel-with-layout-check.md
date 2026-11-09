---
date: 2026-11-08
updated:
area: security
status: active
source: .ai/runs/2026-11-08-boundaries-part1.md
promoted:
---

# Strona panelu sama woła `requireAccess` przed odczytem danych: layout nie chroni strony

## Kontekst
`GET /admin/<obcy-slug>/menu` odpowiadał 403, a anonimowy `GET /admin/halka/menu` przekierowaniem, ale w ciele obu odpowiedzi były nazwy, id, ceny i statusy wszystkich dań restauracji (ładunek RSC). Znalazł to test `access-boundaries-matrix` (T-29), nie przegląd kodu.

## Przyczyna
Layout `[slug]` woła `requireAccess(slug)`, ale Next.js renderuje layout i stronę równolegle. Strona listy menu czytała `adminService.menu(slug)` bez własnego sprawdzenia, więc dane trafiały do strumienia, zanim layout zdążył wywołać `forbidden()` albo `redirect()`. Pozostałe strony wołały `requireAccess` przed odczytem, więc nie przeciekały.

## Reguła
Każda `page.tsx` pod `/admin/[slug]` woła `await requireAccess(slug)` przed pierwszym odczytem danych (`AGENTS.md` §1.3: „każde wejście sprawdza samo”). Test granicy sprawdza **ciało** odpowiedzi 403 i przekierowania pod kątem nazw z cudzych danych, nie tylko status.

## Jak sprawdzić
`packages/app/tests/e2e/access-boundaries-matrix.e2e.test.ts`, T-29 (obce konto, obce id, konto anonimowe, 16 stron). Czerwony na `(lists)/menu/page.tsx` bez poprawki. Do zrobienia: sprawdzenie maszynowe, że każda strona pod `[slug]` woła `requireAccess` przed danymi.
