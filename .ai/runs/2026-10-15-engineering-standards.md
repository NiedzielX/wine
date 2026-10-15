---
started: 2026-10-15
ended: 2026-10-15
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-15-engineering-standards.md
outcome: success
related: [.ai/runs/2026-10-14-import-and-qr.md]
---

# Wdrożenie standardów inżynieryjnych

## Zadanie
Polecenie właściciela: wdrożyć specyfikację standardów z `.ai/docs/engineering-standards.md`.

## Przebieg
1. Pod tą ścieżką nie było pliku; przekazany plik opisuje **inny produkt (DevMentor)** (pakiety `@devmentor/*`, rezerwacje i płatności, `app → core → db`, JWT). Zapisano go jako dokument źródłowy w `.ai/docs/reference/` z adnotacją i napisano specyfikację mapującą każdy standard na Wine Match (wdrożyć / odstępstwo z powodem / nie dotyczy).
2. Weryfikacja narzędzi: `typescript-eslint` niezgodny z TypeScript 7 (peer `<6.1`) → `oxlint`; `npm audit --omit=dev`: 5 wysokich — Next.js 16.3.7 (realne, poprawka w 16.3.8) i `awilix → braces` (bez poprawki, nieosiągalne: nie używamy `loadModules`).
3. Plan wykonania (kolejność od największego ryzyka): aktualizacja Next.js (jedyna zmiana, która mogła zmienić zachowanie całości) i bramka audytu → `oxlint` z konfiguracją → logger z redakcją i walidowana konfiguracja → walidatory Zod i ujednolicone trasy → scrypt i przeliczanie skrótów → wspólne stany UI → podkatalogi pojęć (skryptem) → dowód „bez bazy” → dokumentacja i CI.
4. Błędy i ślepe uliczki:
   - Plik pod wskazaną ścieżką nie istniał, a przekazany dotyczył innego produktu — adaptacja zamiast dosłownego wykonania (lekcja `adopting-a-foreign-standard`).
   - `npm audit`: Next.js — realna aktualizacja (16.3.8 spełnia regułę wieku 14 dni); `awilix → braces` bez poprawki → wyjątek jawny, z uzasadnieniem i terminem, a bramka sprawdzona negatywnie (pada bez wyjątku).
   - **Własna regresja:** po wprowadzeniu walidowanej konfiguracji `next build` bez środowiska padał na statycznej stronie `/`. Wykryte testem „build bez środowiska i bez bazy”; `force-dynamic`.
   - **Przy przepisywaniu trasy stołu wkleiłem do pliku śmieciowy zalążek** (`apiTableInput` nie istnieje, resztki polecenia powłoki). Trasa była zepsuta przez jedną turę; zauważyłem od razu i napisałem ją od nowa, a pokrywa ją smoke.
   - Dwa błędy znalezione przez testy, nie przez przegląd: słownik `fields[klucz] ??= …` gubił `constructor` i `__proto__` (te same pułapki w `redact`), oraz zły kod `too_few` dla liczby.
   - Skrypty testowe: `pkill -f "next start …"` zabił własną powłokę (dwukrotnie, wynik `-1`), `ss` niedostępne w sandboxie, `boot:check` zależny od lokalnego `.env`, `typescript-eslint` niezgodny z TypeScript 7.
   - Odpowiedzialne zawężenie: nie budowałem `makeCrudRoute`, `CrudForm`, `DataTable`, `apiCall`, magistrali zdarzeń ani limitu per IP; każda decyzja ma uzasadnienie w tabeli mapowania.

## Weryfikacja
- `npm run lint` — 0 błędów (131 reguł, 211 plików); `typecheck` OK; `npm test` — 282 (core) + 28 (db); `npm run test:db` — 47 na PostgreSQL 16; `schema:check` zgodny; `npm run audit:gate` OK; `npm run build` OK (także `env -i`, bez bazy i bez `.env`); `npm run boot:check` — 10/10, z lokalnym `.env` i bez niego.
- `npm run smoke`: `memory` 155/155, `postgres` 155/155.
- Playwright na PostgreSQL po aktualizacji Next.js: `authflow` (logowanie, blokada, uprawnienia, wygasanie, bez JS), `forge2` (sfałszowane formularze z konta GM i anonimowe odrzucone, próba kontrolna), `importflow` (XLSX / PDF / CSV, QR dekodowany, Setup, zmiana sluga, bez JS, 390 px); brak błędów w konsoli, zero błędów w logu serwera.

## Wynik
Standardy wdrożone w zakresie, w jakim mają zastosowanie do Wine Match, z udokumentowanymi odstępstwami. Dwa problemy bezpieczeństwa naprawione (scrypt, Next.js), jeden ryzykowny domyślny zachowanie zamknięte (`DATA_SOURCE`). Dług i decyzje właściciela: limit logowania per IP + e-mail, wyjątek audytu do 2027-01-15, testy przeglądarkowe nadal poza repozytorium (skrypty w `/tmp`), CI nie było uruchomione (brak dostępu do GitHub Actions; plik zwalidowany jako YAML, polecenia przetestowane lokalnie).

## Lekcje
- `.ai/lessons/2026-10-15-adopting-a-foreign-standard.md`
- `.ai/lessons/2026-10-15-client-chosen-keys.md` (awans do `AGENTS.md` §1.6)
- `.ai/lessons/2026-10-15-config-fails-closed-and-boot-without-env.md` (awans do `AGENTS.md` §1.6)

## Weryfikacja końcowa (czysta kopia, po `npm ci`)
- `npm ci` OK; `lint` 0 błędów; `typecheck` OK; `test` 282 + 28; `test:db` 47 (migracje 4, seeder, `schema:check` zgodny); `audit:gate` OK (wyjątek do 2027-01-15); `build` OK w `env -i` bez `.env`; `boot:check` OK.
- `smoke` na zbudowanej kopii: `postgres` 155/155, `memory` 155/155; zero błędów w logach serwera.
- Przeglądarka na przebudowanej aplikacji (PostgreSQL): `authflow` (20 sprawdzeń), `forge2` (sfałszowane formularze odrzucone, kontrola zatwierdzona), `importflow` (import, QR, Setup, zmiana sluga, bez JS); brak błędów w konsoli i w logu serwera.
- ZIP odświeżony: 478 plików, bez `node_modules`, `.next` i `.env`.
