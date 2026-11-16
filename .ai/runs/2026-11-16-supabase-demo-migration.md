---
started: 2026-11-16 14:10
ended: 2026-11-16 14:45
agent: Claude Code
spec: brak — operacja na instancji demo (zgoda właściciela w czacie: „2”); kontekst `.ai/specs/2026-11-15-vercel-hosting.md` (draft)
outcome: success
related: [.ai/runs/2026-11-16-demo-database-workflow.md]
---

# Migracja i dane demo na bazie Supabase instancji `wine-nhlf`, bez komputera właściciela

## Zadanie
Właściciel założył bazę Supabase przez integrację Vercela i nie chciał uruchamiać migracji lokalnie. Agent dostał konektor Vercela. Wartości zmiennych integracji są typu `sensitive` (nieczytelne), więc migracja musiała biec wewnątrz buildu Vercela, który ma do nich dostęp.

## Przebieg
- Odczyt projektu i zmiennych (tylko nazwy). Pierwsza zmiana polecenia budowania i próba odczytu projektu: odczyt zablokowany przez klasyfikator uprawnień; polecenie przywrócone (`null`). Właściciel wybrał opcję 2 (zgoda na migrację przez wdrożenie).
- Tymczasowe `buildCommand` (migracja + seed z `POSTGRES_URL`, port 6543 → 5432) i wdrożenia podglądowe z `main` (`target: null`, produkcja nietknięta):
  1. `dpl_3KG2…`: `ESSLREQUIRED`.
  2. `dpl_9JWm…` (`?sslmode=no-verify` w adresie): `ESSLREQUIRED` — MikroORM pomija parametry adresu.
  3. `dpl_4pKJ…` (`PGSSLMODE=require`): `self-signed certificate in certificate chain`.
  4. `dpl_Ev8t…` (`PGSSLMODE=no-verify`): wszystkie migracje, „Successfully migrated up to the latest version”, „Seeder DemoSeeder successfully executed”.
- Po każdej serii `buildCommand` przywrócone do `null` (ostatnio po próbie 4).
- Dodane zmienne Vercela: `PGSSLMODE=no-verify`, `DB_POOL_MAX=3` (production, preview).
- Repozytorium: `PGSSLMODE` w workflow `demo-database.yml`, opis SSL w `docs/DEPLOYMENT.md` §17.1, lekcja.

## Weryfikacja
Logi buildu `dpl_Ev8twojfJgEaQDQbae9mFBGkH94Z` (komunikaty migratora i seedera). Produkcyjne wdrożenie `dpl_GU5Z…` było `READY` przez cały czas prób. Po dodaniu `DATABASE_URL` przez właściciela (tylko Production): `DATA_SOURCE=postgres` tylko dla Production, nowa zmienna `DATA_SOURCE=memory` dla Preview (podglądy bez adresu bazy), redeploy produkcji `dpl_51YqengbqiviURZaSvi9Age3jFPM` (`READY`). `GET /start?lang=pl` → 200 z kartami Marty i Tomasza, które `/start` pokazuje tylko dla kont istniejących w repozytorium, czyli odczyt z Supabase działa. Logi z 15 minut: brak błędów, tylko ostrzeżenia `RATE_LIMIT_SECRET is not set` i `TRUSTED_PROXY_HOPS=0`.

## Wynik
Baza demo gotowa, produkcja `wine-nhlf` działa na Supabase. Do zrobienia przez właściciela: przeklikanie panelu po zalogowaniu (czy wylogowania zniknęły), `RATE_LIMIT_SECRET` (`openssl rand -hex 32`), decyzja o `TRUSTED_PROXY_HOPS` i regionie funkcji (dziś `iad1`/`sfo1`, baza we Frankfurcie), sprzątanie zmiennych integracji i Data API. Dług: `no-verify` bez weryfikacji certyfikatu — dla produkcji `ssl.ca` w `packages/db/src/config.ts`.

## Lekcje
- `.ai/lessons/2026-11-16-supabase-ssl-pgsslmode.md`
