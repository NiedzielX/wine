---
started: 2026-10-29 08:00
ended: 2026-10-29 15:05
agent: Claude Code
spec: brak — drobna poprawka (zależności bez zmiany zachowania, wyjątki audytu z .ai/runs/2026-10-25-audit-gate-next-zod-undici.md)
outcome: success
related: [.ai/lessons/2026-10-25-audit-gate-new-advisories.md]
---

# Zbumpować `next` i `undici` przed wygaśnięciem wyjątków `audit:gate` (2026-10-29)

## Zadanie
Zaplanowane przypomnienie z 2026-10-25 (PR #97 zmergowany): wyjątki dla `next` i `undici` wygasają 2026-10-29. Zasada §1.1: nowe zależności z wydań starszych niż 14 dni.

## Przebieg
- `npm view <pkg> time` o 08:02Z: `next` 16.4.1 (2026-10-14T17:43Z) ma 14 dni i 14 godzin: do użycia; 16.4.2 (2026-10-15T20:57Z) jeszcze nie. `undici` 7.30.1 (2026-10-15T14:18Z) ma 13 dni i 17 godzin: **jeszcze nie spełnia reguły 14 dni**, będzie dziś o 14:18Z.
- `next` 16.3.8 → 16.4.1 (`packages/app/package.json`, lockfile), wyjątek dla `next` usunięty z `scripts/audit-gate.mjs`; tabela stosu w `AGENTS.md` poprawiona (była 16.3.7, nieaktualna).
- Po `npm install` `audit:gate` padło: od 2026-10-25 opublikowano pięć kolejnych advisories dla `undici` < 7.30.1 (GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm, GHSA-9fm3-97px-rjf6, GHSA-55wc-3pg8-jfw6), z tą samą poprawką co poprzednie trzy. Bramka zadziałała jak zaprojektowano (nowy advisory na wyjątkowanym pakiecie zawodzi), więc `main` byłby dziś czerwony dla każdego nowego PR-a.
- Decyzja: nie łamię reguły 14 dni o 6 godzin. Wyjątek dla `undici` rozszerzony o pięć nazwanych advisories (ten sam pakiet, ten sam wygasający dziś termin, tylko harness testowy, nigdy wdrażany), a `undici` zbumpuję dziś po 14:18Z (przypomnienie `send_later` na 14:25Z).

- 14:48Z zaplanowane przypomnienie: `undici` 7.30.1 (2026-10-15T14:18:31Z) ma 14 dni i 30 minut. `npm update undici` podniosło w lockfile 7.30.0 → 7.30.1 (testcontainers wymaga `^7.24.5`), ostatni wyjątek `undici` usunięty z `scripts/audit-gate.mjs`; zostaje tylko wyjątek `braces`. Zmiany dodane do tego samego PR-a (#104), żeby jeden merge zamykał oba wyjątki; opis PR-a zaktualizowany.

## Weryfikacja
- `npm run lint`, `typecheck`, `test`, `build`, `boot:check`: zielone (exit 0) po bumpie `next`. `audit:gate` po rozszerzeniu wyjątku: przechodzi (high: 1, wszystkie 8 advisories `undici` objęte).
- Po bumpie `undici` (14:50Z): `audit:gate` (high 0, critical 0), `lint`, `typecheck`, `test`, `build`: zielone (exit 0).
- `test:db` i `e2e` zostawione CI: bez Dockera lokalnie nie da się uruchomić ścieżki testcontainers, która używa `undici`; `TEST_DATABASE_URL` jej nie ćwiczy.

## Wynik
`next` 16.4.1 i `undici` 7.30.1 zbumpowane, oba wyjątki usunięte (został tylko `braces` do 2027-01-15). Do potwierdzenia przez CI: `database` i `e2e` (testcontainers).

## Lekcje
- zaktualizowana: `.ai/lessons/2026-10-25-audit-gate-new-advisories.md`
