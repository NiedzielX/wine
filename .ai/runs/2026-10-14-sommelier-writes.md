---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-14-phase3-sommelier-writes.md
outcome: success
related: [.ai/runs/2026-10-14-admin-readonly-screens.md]
---

# Migracja — Faza 3: zapisy sommeliera i publikacja

## Zadanie
Polecenie właściciela: kontynuować szybko, decyzje podejmować samodzielnie według wytycznych. Pierwsza nieukończona faza planu: Faza 3.

## Przebieg
1. Przeczytano plan i lekcje; stan bazowy zielony (Faza 2). Zapisano specyfikację z decyzjami (Server Actions, brak REST zapisu przed uwierzytelnianiem, migawka publikacji, zabezpieczenie `ADMIN_WRITES_ENABLED`).
2. `core`: błędy domenowe, porty zapisu (`commit` atomowy z `expectedVersion`), `pairing-rules.ts` (`DishPlan`), `SommelierService`, `PublishService`, pamięć z migawką i historią, kontrakt zapisu; potem `AdminService.pairingWorkbench`. Guest-serwisy przełączone na `listPublished*`.
3. `db`: encje `PublishedVersion` i `SommelierDecision` (bez FK), repozytoria zapisu z mapowaniem błędów bazy, seeder z wersją 1, migracja z diffu (SQL przejrzany przed zastosowaniem); baza deweloperska odtworzona od zera.
4. `app`: kontener DI (zegar, generator id, repozytoria zapisu, serwisy), akcje serwerowe, `ActionButton`, komunikaty, A6 / A7 / A4 / A11, liczniki w nawigacji, `ADMIN_WRITES_ENABLED`.
5. Błędy i ślepe uliczki:
   - Test reguł: 3 porażki. (a) `changesCount` w kontrakcie nie uwzględniał dań `draft` — błąd testu; (b) **`setRole` rzucał synchronicznie** zamiast zwrócić odrzuconą obietnicę — realny błąd, naprawiony (`async`); (c) test „nothing to publish” zakładał brak dań `draft` w danych demo — błąd testu.
   - Kolizja nazw typów w `core` (`MenuRow`/`WineRow`) pojawiła się już w Fazie 2; tu uniknięta.
   - Testy przeglądarkowe: trzy kolejne wyścigi w moim skrypcie (ten sam URL po przekierowaniu, liczenie przycisków przed odświeżeniem, rekurencja w helperze). Za każdym razem sprawdzałem stan w bazie, zanim uznałem, że to błąd testu (baza pokazywała poprawny wynik). Synchronizacja na żądanie POST akcji — lekcja uzupełniona.
   - Test „dodaj własny pairing” wybierał wino, które było już propozycją silnika, więc zatwierdził propozycję zamiast utworzyć ręczny pairing — zachowanie poprawne (potwierdza test jednostkowy), test poprawiony.
   - **Realny błąd UI:** liczniki w pasku bocznym były nieaktualne po akcji (layout zachowywany przez Next.js). Znaleziony przez wydruk nawigacji w teście, naprawiony `revalidatePath(..., 'layout')`, potwierdzony osobnym testem liczników (lekcja `server-action-layout-revalidate`).
   - Decyzja bezpieczeństwa: brak REST API zapisu i zapisy domyślnie wyłączone w produkcji, dopóki nie ma logowania.

## Weryfikacja
- `npm run typecheck` OK (5 pakietów); `npm test` — 96/96; `npm run test:db` — 21/21 na PostgreSQL 16; `schema:check` zgodny; `npm run build` OK (granice pakietów).
- `npm run smoke`: `memory` 56/56, `postgres` 56/56.
- Playwright na PostgreSQL: zatwierdzanie (x3), kolejność, rola, notatka (limit 140 po stronie serwera), odrzucenie / przywrócenie, własny pairing i jego usunięcie (historia w bazie po usunięciu), konflikt wersji między dwiema sesjami, publikacja (wersja 2, licznik 6), goście bez zmian przed publikacją i ze zmianami po niej, ukrywanie wina (od razu), ustawienia gości, zapisy wyłączone (komunikat, dane nietknięte), obcy adres powrotu zignorowany, zatwierdzanie z wyłączonym JS; tryb `memory`: zatwierdzanie, publikacja, ukrycie wina; liczniki nawigacji po każdej zmianie.

## Wynik
Faza 3 zakończona (AC1–AC5). Następna: Faza 4 (uwierzytelnianie, role, REST API zapisu, prawdziwy `actor`). Dług: panel bez logowania (zapisy chronione tylko flagą środowiskową); edycja dania i wina nie jest w żadnej fazie planu.

## Lekcje
- `.ai/lessons/2026-10-14-write-path-conventions.md` (awans do `AGENTS.md` §1.3)
- `.ai/lessons/2026-10-14-server-action-layout-revalidate.md` (awans do `packages/app/AGENTS.md`)
- uzupełniona: `ssr-html-assertions-and-test-races`
