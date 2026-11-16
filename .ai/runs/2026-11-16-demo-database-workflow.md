---
started: 2026-11-16 13:30
ended: 2026-11-16 13:50
agent: Claude Code
spec: brak — narzędzie operatora dla instancji demo (workflow ręczny, 1 plik + docs); kontekst: `.ai/specs/2026-11-15-vercel-hosting.md` (draft)
outcome: partial
related: [.ai/runs/2026-11-16-interactive-demo-entry-spec.md]
---

# Workflow do migracji i seedu bazy demo bez lokalnego komputera

## Zadanie
Właściciel założył bazę Supabase przez integrację Vercela i nie chce uruchamiać `db:migrate` i `db:seed` na własnym komputerze. Wartości zmiennych integracji są dla agenta niedostępne (typ `sensitive`), a środowisko agenta nie ma sieci do Supabase.

## Przebieg
Ręczny workflow `demo-database.yml`: tylko `main`, wymagane `confirm=DEMO`, sekret w środowisku `demo-database`, port 6543 → 5432 (session pooler), adres maskowany. Akcje przypięte jak w `ci.yml`. Opis w `docs/DEPLOYMENT.md` §17.1, wpis w CHANGELOG.

## Weryfikacja
Składnia YAML sprawdzona parserem; workflow nie był jeszcze uruchamiany (wymaga sekretu właściciela), więc działanie na prawdziwej bazie jest niezweryfikowane.

## Wynik
Czeka na: scalenie PR, środowisko i sekret `DEMO_DATABASE_URL`, pierwsze uruchomienie przez właściciela. Niezweryfikowane: SSL do Supabase z runnera, zachowanie `db:migrate` na poolerze sesji.

## Lekcje
brak
