---
date: 2026-11-08
updated:
area: tooling
status: active
source: .ai/runs/2026-11-08-migration-roundtrip-and-concurrency.md
promoted:
---

# Limit „sprawdź, potem wstaw” bez blokady przepuszcza równoległe żądania; migracja ma dowód up/down/up

## Kontekst
Test równoległości (`packages/db/tests/concurrency.integration.test.ts`) znalazł jeden prawdziwy wyścig: limit kodów polecenia na sesję (R13, 30 na dzień) był sprawdzany przez `countBySession` w serwisie, a wstawiany w osobnym zapytaniu. Dziewięć równoległych żądań jednej sesji przy 29 istniejących kodach dało 32 kody. Reszta ścieżek (akceptacja zaproszenia, zaproszenia na ten sam adres, `expectedVersion` roli i pary, ostatni właściciel, potwierdzenie importu, wydawanie kodu) była już poprawna.

## Przyczyna
Odczyt i zapis w dwóch instrukcjach bez wspólnej blokady: `READ COMMITTED` nie widzi cudzych niezatwierdzonych wierszy. Unikalność kodu i wyboru ma indeks, limit nie ma ograniczenia, które by go wyraziło.

## Reguła
- Limit, licznik albo „co najwyżej N” nad zbiorem wierszy egzekwuj w jednej transakcji z `pg_advisory_xact_lock` na kluczu zbioru (`tryIssue(…, sessionLimit)`), nie w serwisie. Jeśli da się wyrazić indeksem unikalnym lub `for update` na wierszu rodzica, wolej to.
- Test współbieżności: każdy rywal ma własny `EntityManager` (własne połączenie), start przez jedną bramkę (`race()` w `tests/support/pg.ts`), bez `sleep`, 10 rund od czystego stanu, asercje na tabelach po wyścigu (nie tylko na statusach). Przegrany wyścigu zaproszenia dostaje `invalid_token` albo `sign_in_required` (zależnie od tego, czy konto zwycięzcy było już widoczne przy jego wstępnym sprawdzeniu); przegrany równoległego zaproszenia na ten sam adres może dostać `invitation_conflict` (zachowanie zamierzone, `PgInvitationRepository.create`). Obie odpowiedzi to nie błąd: sprawdzaj stan.
- Migracje: `migrations-roundtrip.integration.test.ts` cofa każdą migrację poza bazową `initial` (jej `down` skasowałby schemat; zastosowanych migracji nie edytujemy). Nowa migracja bez `down()` zawiesza test.

## Jak sprawdzić
`npm run verify:regression -- packages/db/tests/concurrency.integration.test.ts` (czerwone na kodzie sprzed poprawki: 32 > 30); `npm run test:db`.
