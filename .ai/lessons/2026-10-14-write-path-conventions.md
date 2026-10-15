---
date: 2026-10-14
updated:
area: engine
status: active
source: .ai/runs/2026-10-14-sommelier-writes.md
promoted: AGENTS.md §1.3
---

# Zapisy: reguły w czystych funkcjach, atomowy `commit`, błędy domenowe, jeden kontrakt dla obu magazynów

## Kontekst
Faza 3 dodała zapisy sommeliera (zatwierdzanie, role, kolejność, publikacja). Kilka decyzji projektowych okazało się wartych utrwalenia.

## Reguły
- **Reguły w `core`, nie w bazie ani stronie.** `pairing-rules.ts` planuje zmianę na kopii roboczej (`DishPlan`) i zwraca listę operacji + wpisy historii; repozytorium tylko je stosuje. Testy reguł nie potrzebują bazy.
- **`commit` jest atomowy i uporządkowany.** Baza nie odracza indeksu „jeden Primary na danie”, więc degradacja starego Primary musi być operacją **przed** awansem nowego (PostgreSQL: transakcja, flush po każdej operacji).
- **Kontrakt zapisu wspólny dla pamięci i PostgreSQL** (`core/src/testing/write-contract.ts`): konflikt wersji, atomowość, niezmienniki, historia po usunięciu, migawka publikacji. Nowa zasada magazynu = nowy przypadek w kontrakcie.
- **Komendy zawsze zwracają odrzuconą obietnicę**, nigdy nie rzucają synchronicznie (metoda `async` nawet przy walidacji na początku).
- **Błędy domenowe** (`DomainError` z `code`) tłumaczone na komunikaty w jednym miejscu; błędy bazy (`UniqueConstraintViolation`, `OptimisticLock`) mapowane na domenowe w repozytorium.
- **Czas i identyfikatory z zewnątrz** (`Clock`, `IdGenerator`); `updatedAt` ustawia aplikacja (bez automatycznego hooka `onUpdate`), żeby audyt miał czas z jej zegara.
- **Historia bez klucza obcego** do pairingu — audyt musi przeżyć usunięcie rekordu.
- **Goście czytają migawkę, panel dane bieżące.** Rozróżnienie `listPublished*` / `list*` w porcie jest świadome; nowa funkcja dla gości używa `listPublished*`.

## Jak sprawdzić
`npm test` (reguły i kontrakt na pamięci), `npm run test:db` (ten sam kontrakt na PostgreSQL, współbieżność na dwóch sesjach, równoważność z pamięcią).
