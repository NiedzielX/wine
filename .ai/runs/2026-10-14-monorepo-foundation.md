---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/implemented/2026-10-14-monorepo-nextjs-architecture.md
outcome: success
related: [.ai/runs/2026-10-14-agents-rules-from-cc-tips.md]
---

# Założenie monorepo Next.js + MikroORM + Awilix + Tailwind/shadcn z pionowym przekrojem

## Zadanie
Polecenie właściciela: monorepo z `packages/{app,core,db,ui}`, Next.js, React, TypeScript, PostgreSQL + MikroORM, Awilix, Tailwind (gość) i shadcn/ui (panel); AGENTS.md z założeniami; README z architekturą. Przebieg w dwóch sesjach (przerwa po wygenerowaniu migracji, kontynuacja na polecenie „kontynuuj”).

## Przebieg
1. Wersje z rejestru npm, najnowsze opublikowane ≥ 14 dni temu: next 16.3.7, react 19.3.0, typescript 7.0.2, @mikro-orm/* 7.2.2, awilix 13.0.5, tailwindcss 4.3.3, vitest 5.0.2, vite 8.3.1, tsx 4.23.15, npm 11.20.0.
2. Sonda: TS 7 bez klasycznego API JS → Next `experimental.useTypeScriptCli`; MikroORM 7 `defineEntity` + Awilix 13 kompilują się pod TS 7; MikroORM 7 wymaga Node ≥ 22.17; CLI ładuje TS przez tsx.
3. Specyfikacja z planem (`in-progress`), lokalny PostgreSQL 16 do weryfikacji.
4. Mockupy → `packages/mockups`; silnik, typy, dane demo → `packages/core`; generator propozycji i zbiór demo (stabilne UUID) przeniesione do `core`, używane przez mockupy, pamięć i seeder.
5. `core`: porty repozytoriów (zakres restauracji w kontrakcie), `RecommendationService`, `CatalogService`, repozytoria w pamięci, `repositoryContract`.
6. `db`: 7 encji (`defineEntity`, profile jako embeddable), konfiguracja runtime/CLI, singleton ORM, mappery, repozytoria, `DemoSeeder`, migracja początkowa.
7. `ui`: komponenty shadcn new-york-v4 ze źródeł GitHub (rejestr niedostępny), motyw panelu, `MatchGlass`.
8. `app`: grupy tras `(guest)` i `(admin)` z osobnymi layoutami, endpoint REST, kontener Awilix (`DATA_SOURCE=memory|postgres`, zakres na żądanie). Strony korzystają wyłącznie z serwisów.
9. `scripts/check-boundaries.mjs` — granice pakietów jako część `npm run build`.
10. Ślepe uliczki i błędy:
    - npm 10 nie instaluje Vitest 5 (`edgesOut`) → wymagany npm ≥ 11.6 (`packageManager`, `engines`, `engine-strict`); npm 11.20 blokuje skrypty instalacyjne → `allowScripts: { esbuild: false }`.
    - `mkdir -p {a,b}` w `dash` — **drugi raz** ten sam błąd → reguła awansowana do `AGENTS.md` §1.5.
    - TS 6+/7: deklaracje importów CSS, brak `structuredClone` w czystym ES2023 → `globals.d.ts` w `core`.
    - Dodając `engine:matrix`, nie zauważyłem, że sprawdzenie typów `core` nie wypisało „ok” (skrypt używa typów Node). Wyłapane dopiero na czystej kopii → osobny `tsconfig.scripts.json`.
    - Czysta kopia ujawniła też, że README kazało tworzyć `.env` w katalogu głównym, którego Next.js i CLI MikroORM nie czytają, oraz że skrypt `dev` nie przekazywał argumentów → `process.loadEnvFile` w trzech punktach wejścia, `--` w skryptach głównych.
11. Dokumentacja: `AGENTS.md` §1 (stos, pakiety i granice, logika/dane/DI, frontend, polecenia) + aktualizacja §3, §6.1, §7, §8; `packages/*/AGENTS.md` i `CLAUDE.md` (`@AGENTS.md`); nowy `README.md` z architekturą; szczegóły mockupów → `packages/mockups/README.md`; `DATA_MODEL.md` (stan implementacji), `API_SPECIFICATION.md` (parametr `restaurant`), `RECOMMENDATION_ENGINE.md` (ścieżki).

## Weryfikacja
Główne repozytorium i czysta kopia (bez `node_modules`, `.next`, `dist`):
- `npm install` (npm 11.20.0) — OK; `npm run typecheck` — OK we wszystkich pakietach, także przed pierwszym buildem.
- `npm test` — 35/35 (23 silnika, 12 serwisów/zbioru demo/kontraktu w pamięci).
- Pusta baza: `npm run db:migrate`, `npm run db:seed` (idempotentny: 1 restauracja, 15 dań, 20 win, 62 pary, 9 Primary), `schema:check` — „schema is up-to-date”.
- `npm run test:db` — 8/8 na PostgreSQL 16: kontrakt repozytoriów, identyczne rekomendacje z bazy i z silnika dla wszystkich opublikowanych dań, baza odrzuca drugi Primary dla dania i duplikat pary.
- `npm run build` — granice OK, mockupy (Vite 8) i Next.js 16 zbudowane; celowy błąd typu zatrzymuje `next build` (typecheck przez CLI TS 7 działa).
- `next start` w trybie `memory` i `postgres`: 11 adresów z oczekiwanymi kodami (200/307/404/422); odpowiedzi API identyczne w obu trybach; zmiana `wine.active` w bazie od razu widoczna w API.
- `npm run dev` z głównym `.env` (`DATA_SOURCE=postgres`) — strony i API 200, panel pokazuje źródło `postgres`.
- Zrzuty ekranu (Playwright): strona gościa 390 px, panel 1440 px i 390 px — bez poziomego przewijania i błędów konsoli.
- Mockupy po przebudowie: te same wyniki co wcześniej (Savigny-lès-Beaune, stolik 85%), regeneracja propozycji działa.
- `check-boundaries`: 5 celowo wprowadzonych naruszeń wykrytych, po cofnięciu — OK.

## Wynik
Wszystkie kryteria akceptacji specyfikacji spełnione; specyfikacja w `implemented/`. Do zrobienia w kolejnych specyfikacjach: pozostałe ekrany z `docs/SCREEN_SPECIFICATION.md`, edycja pairingów (zapisy + `SommelierDecision`), uwierzytelnianie i role, import po stronie serwera, analityka, publikacja wersji. Do potwierdzenia przez właściciela: npm workspaces zamiast pnpm/Turborepo, wymaganie npm 11.

## Lekcje
- `.ai/lessons/2026-10-14-npm-11-for-vitest-5.md`
- `.ai/lessons/2026-10-14-typescript-7-toolchain.md`
- `.ai/lessons/2026-10-14-posix-shell-in-scripts.md` (awans do `AGENTS.md` §1.5)
- `.ai/lessons/2026-10-14-claude-code-nested-claude-md.md`
- zaktualizowane: `engine-calibration-matrix` (polecenie `npm run engine:matrix`), ścieżki w `import-drafter-keyword-order`, `css-grid-min-width`, `single-file-build-for-sharing`
