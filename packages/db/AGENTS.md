# packages/db — AGENTS.md

Zasady ogólne: `../../AGENTS.md` (§1.2–1.3 i §7). Model danych: `../../docs/DATA_MODEL.md`.

**Co tu jest:** encje MikroORM (`src/entities`), konfiguracja runtime z pulą połączeń (`src/config.ts`), konfiguracja CLI z migratorem i seederem (`src/mikro-orm.config.ts`), singleton ORM (`src/orm.ts`), mappery encja → domena (`src/mappers.ts`), repozytoria implementujące porty z `core` (`src/repositories`), migracje (`src/migrations`), seedery (`src/seeders`).

**Zasady:**
- Encje wyłącznie przez `defineEntity` + `p.*`; nowa encja trafia do `ENTITIES` w `src/entities/index.ts`.
- Po każdej zmianie encji: `npm run db:migration:create` (wymaga `DATABASE_URL`), przejrzyj wygenerowany SQL, potem `npm run db:migrate` i `npm run schema:check -w @wine-match/db`. Zastosowanych migracji nie edytuj — dodaj nową.
- Ograniczenia, których model nie wyrazi (np. częściowy indeks unikalny), dodawaj jako `indexes: [{ expression }]` w encji, żeby trafiły do migracji i snapshotu.
- Repozytoria: konstruktor `({ em })`, każde zapytanie z `restaurant: restaurantId` i `deletedAt: null` (dla encji z soft delete), zwracają typy z `@wine-match/core` przez mappery. Encje nie opuszczają pakietu.
- Kwoty jako `decimal` mapowane na `number` (`p.decimal('number')`); daty jako `timestamptz`.
- Seedery muszą być idempotentne.

- `src/import` (`@wine-match/db/import`, osobne wejście bez MikroORM): parsery plików (`NodeImportFileParser`: CSV w UTF-8 i Windows-1250, własny czytnik XLSX na `fflate` z limitem rozpakowania i bez parsera XML, PDF na `unpdf` jako linie tekstu). Typ po zawartości, nieudany plik = `ValidationError` z czytelnym kodem. `PgImportRepository.confirm` w jednej transakcji z blokadą wiersza zadania. Pliki testowe tworzy `tests/fixtures/generate.py`.
- `src/auth` (`@wine-match/db/auth`, osobne wejście bez MikroORM): hasher scrypt (`ScryptPasswordHasher`) i tokeny sesji (`NodeSessionTokens`); `core` nie może używać `node:crypto`, więc implementacje portów `PasswordHasher` i `SessionTokens` są tutaj. Konta: encje `User` (`app_user`), `Membership`, `Session` (w bazie tylko hash tokenu), `PgAuthRepository` (atomowy licznik prób w jednym `UPDATE … RETURNING`). Polecenie `npm run user:create`. Seeder zakłada konta demo (hasło publiczne — tylko dane demo).

**Testy:** `npm run test:db` (z katalogu głównego). Test tworzy świeżą bazę `<nazwa>_test`, stosuje prawdziwe migracje, uruchamia seeder i `repositoryContract` z `core`.
