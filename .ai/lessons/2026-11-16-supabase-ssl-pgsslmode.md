---
date: 2026-11-16
updated:
area: tooling
status: active
source: .ai/runs/2026-11-16-supabase-demo-migration.md
promoted:
---

# SSL do Supabase ustawiaj przez `PGSSLMODE`, nie przez `?sslmode=` w `DATABASE_URL`

## Kontekst
Migracja bazy demo na Supabase (pooler `aws-1-eu-central-1.pooler.supabase.com:5432`) z buildu Vercela. Trzy próby padły po kolei: bez SSL `(ESSLREQUIRED) SSL connection is required for user: postgres`; z `?sslmode=no-verify` w adresie ten sam błąd; z `PGSSLMODE=require` błąd `self-signed certificate in certificate chain`. Czwarta, z `PGSSLMODE=no-verify`, przeszła (migracje i `DemoSeeder`).

## Przyczyna
MikroORM 7 (`PostgreSqlConnection.getConnectionOptions`) rozkłada `clientUrl` na host, port, użytkownika, hasło i bazę, a parametry zapytania (poza `schema`) pomija, więc `sslmode` z adresu nie dociera do `pg`. `pg` czyta za to `PGSSLMODE` ze środowiska, gdy w konfiguracji nie ma `ssl`. Urzędu certyfikacji Supabase nie ma w domyślnym magazynie Node, więc `require` (weryfikacja) odrzuca certyfikat.

## Reguła
Przy bazie wymagającej SSL ustaw `PGSSLMODE` w środowisku procesu (Vercel, workflow, terminal), nie w adresie. Dla demo wystarczy `no-verify`; dla produkcji dodaj w `packages/db/src/config.ts` jawne `driverOptions` z `ssl: { ca }` certyfikatu dostawcy (zmiana kodu, osobna specyfikacja). `DB_POOL_MAX` ustaw nisko (3) przy poolerze i wielu instancjach funkcji.

## Jak sprawdzić
`PGSSLMODE=no-verify DATABASE_URL='<adres>' npm run db:migrate` kończy się „Successfully migrated up to the latest version”; bez `PGSSLMODE` przy Supabase pada `ESSLREQUIRED`.
