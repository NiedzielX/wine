---
date: 2026-11-06
updated:
area: tooling
status: active
source: .ai/runs/2026-11-06-user-invite-script.md
promoted:
---

# Polecenie operatora drukujące sekret: strażnik przed kontenerem, link jedyną linią stdout, adres sprawdzony przed wystawieniem

## Kontekst
`npm run user:invite` wystawia jednorazowy link zaproszenia przez serwis z kontenera aplikacji, z `actor` wskazanym przez `--as`.

## Reguła
- Strażnik środowiska (`assertInviteCommandAllowed`) idzie przed otwarciem kontenera i bazy; ta sama definicja „chronionego” co seeder (`isProtectedEnvironment`).
- Na stdout trafia wyłącznie link (da się go przechwycić przez podstawienie poleceń powłoki); komunikaty na stderr. Błąd inny niż domenowy drukuj bez `message` (błąd sterownika powtarza związane wartości).
- Zbuduj link próbnie (`PUBLIC_BASE_URL` jest fail-closed) PRZED wystawieniem: inaczej zaproszenie istnieje, a nikt nie zna tokenu.
- Skrypt w `scripts/*.ts` uruchamia `tsx`; `run(argv, env, deps)` testuj jednostkowo, a prawdziwy proces na PostgreSQL w `db/tests/*.integration.test.ts` (ścieżka ze spacją sprawdzona).
- Menedżer zaprasza tylko role niższe (sommelier), nie `manager`: test zaczynaj od roli, którą aktor może nadać.

## Jak sprawdzić
`npm run test:db` (`user-invite.integration.test.ts`) i `npx vitest run tests/unit/user-invite.test.ts` w `packages/app`.
