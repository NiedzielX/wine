---
status: implemented
created: 2026-10-14
owner: Filip
related: [.ai/runs/2026-10-14-monorepo-foundation.md, .ai/specs/implemented/2026-10-14-wine-match-mvp-concept.md]
superseded_by:
---

# Architektura produkcyjna: monorepo Next.js + PostgreSQL / MikroORM + Awilix

> Zakres zatwierdzony przez właściciela produktu w poleceniu z 2026-10-14, które zawierało wszystkie decyzje technologiczne poniżej. Agent przyjął je jako status `approved` i rozpoczął realizację.

## Problem
Mockupy (Vite, stan w `localStorage`) dowodzą koncepcji, ale nie są bazą pod produkt: brak bazy danych, serwera, API i podziału kodu na moduły wielokrotnego użytku. Agenci kodujący potrzebują jednoznacznych reguł architektury, żeby kolejne funkcje powstawały spójnie.

## Cel i zakres
Założyć szkielet monorepo z działającym pionowym przekrojem przez wszystkie warstwy oraz udokumentować reguły architektury dla ludzi i agentów.

**Poza zakresem:** przeniesienie wszystkich ekranów mockupów do Next.js, uwierzytelnianie, import plików po stronie serwera, analityka, wdrożenie (CI/CD, hosting). To są osobne, kolejne specyfikacje.

## Decyzje (od właściciela)
- Next.js (najnowszy), React, TypeScript.
- PostgreSQL + MikroORM (migracje, pula połączeń).
- Awilix jako kontener DI.
- Tailwind CSS dla stron frontendowych (gość), shadcn/ui dla stron backendowych (panel).
- Monorepo, katalog `packages/` z minimum: `app`, `core`, `db`, `ui`.

## Decyzje doprecyzowane przez agenta (do potwierdzenia w przeglądzie)
| Temat | Wybór | Dlaczego |
|---|---|---|
| Menedżer monorepo | npm workspaces | już używany w projekcie, bez dodatkowego narzędzia; Turborepo można dodać później bez zmian w strukturze |
| Wersje | najnowsze opublikowane ≥ 14 dni temu, przypięte dokładnie | bezpieczeństwo łańcucha dostaw, powtarzalne buildy |
| TypeScript 7 (natywny) | `experimental.useTypeScriptCli` w Next.js | TS 7 nie ma klasycznego API JS, z którego Next domyślnie sprawdza typy |
| Encje MikroORM | `defineEntity` (bez dekoratorów, bez refleksji) | działa z TS 7, SWC i Turbopack bez `reflect-metadata` |
| Pakiety wewnętrzne | eksport źródeł TS (bez kroku build), `transpilePackages` w Next | szybszy rozwój; jedna kompilacja w aplikacji |
| Źródło danych | port repozytoriów w `core`; implementacje: PostgreSQL (`db`) i pamięć (`core`, dane demo) wybierane przez `DATA_SOURCE` | aplikacja i testy działają bez bazy; DI pokazuje wartość od pierwszego dnia |
| Mockupy | przeniesione do `packages/mockups`, korzystają z silnika z `core` | jeden silnik w jednym miejscu; mockupy nadal służą do pokazów |

## Wymagania
- R1 Monorepo z workspaces `packages/app`, `core`, `db`, `ui` (+ `mockups`); kierunek zależności `app → db → core`, `app → ui`, `mockups → core`; `core` bez zależności od React, Next, MikroORM i Awilix.
- R2 `core`: typy domenowe, silnik dopasowań (przeniesiony bez zmian zachowania), porty repozytoriów, serwisy aplikacyjne z wstrzykiwaniem zależności przez konstruktor, repozytoria w pamięci, dane demo.
- R3 `db`: encje MikroORM dla modelu z `docs/DATA_MODEL.md` (zakres MVP), konfiguracja z pulą połączeń, migracja początkowa, seeder danych demo, repozytoria PostgreSQL implementujące porty z `core`.
- R4 `ui`: komponenty shadcn/ui (new-york-v4), `cn`, motyw Tailwind w barwach Wine Match, `components.json`.
- R5 `app`: Next.js App Router; kompozycja Awilix z zakresem na żądanie; strona gościa z rekomendacjami (Tailwind, bez shadcn); strona panelu z pairingami dania (shadcn z `ui`); endpoint REST `GET /api/v1/dishes/{id}/recommendations`.
- R6 `AGENTS.md` (root i per pakiet) z regułami architektury; `README.md` z opisem architektury.

## Kryteria akceptacji
- [x] AC1 `npm install` w katalogu głównym instaluje wszystkie pakiety.
- [x] AC2 `npm run typecheck` (TS 7) przechodzi we wszystkich pakietach.
- [x] AC3 `npm test`: testy silnika (przeniesione) i serwisów przechodzą.
- [x] AC4 `npm run build` buduje aplikację Next.js i mockupy.
- [x] AC5 Migracja początkowa wygenerowana i zastosowana na PostgreSQL; seeder ładuje dane demo; test integracyjny repozytoriów na prawdziwej bazie przechodzi.
- [x] AC6 Aplikacja działa z `DATA_SOURCE=memory` i `DATA_SOURCE=postgres`: strona gościa, strona panelu i endpoint zwracają te same rekomendacje co silnik.
- [x] AC7 Granice pakietów sprawdzane automatycznie (skrypt: `core` nie importuje zakazanych bibliotek; `ui` nie importuje `core`/`db`).
- [x] AC8 `AGENTS.md` i `README.md` opisują architekturę; dokumentacja odpowiada kodowi.

## Projekt rozwiązania
1. Root: `package.json` (workspaces, skrypty delegujące), `tsconfig.base.json`, `.nvmrc`, `.env.example`, skrypt granic `scripts/check-boundaries.mjs`.
2. `packages/core`: `src/domain` (typy), `src/engine` (z mockupów), `src/ports`, `src/services` (`RecommendationService`, `PairingQueryService`), `src/memory` (repozytoria w pamięci), `src/demo` (Halka); testy z `tests/`.
3. `packages/mockups`: dotychczasowy kod Vite; importy silnika i typów z `@wine-match/core`.
4. `packages/db`: `src/entities` (`defineEntity`), `src/mikro-orm.config.ts`, `src/migrations`, `src/seeders`, `src/repositories`, `src/mappers`; test integracyjny uruchamiany przy `DATABASE_URL`.
5. `packages/ui`: komponenty z rejestru shadcn (źródła z repozytorium shadcn-ui), `src/styles.css`, `components.json`.
6. `packages/app`: `next.config.ts`, `src/server/container.ts` (Awilix), `src/app/(guest)/r/[slug]/...`, `src/app/admin/...`, `src/app/api/v1/...`.
7. Dokumentacja: `AGENTS.md` (sekcja architektury, aktualizacja §1 i §7), `packages/*/AGENTS.md`, `README.md`.

Weryfikacja: AC2–AC4 poleceniami npm; AC5 na lokalnym PostgreSQL 16; AC6 przez `next start` i zapytania HTTP w obu trybach; AC7 skryptem granic.

## Ryzyka i otwarte pytania
- TypeScript 7 jest nowy; część narzędzi ekosystemu może jeszcze zakładać API TS 5/6. Obejście w Next.js udokumentowane; w razie problemów fallback: `typescript@6` tylko w pakiecie `app`.
- Rejestr shadcn (`ui.shadcn.com`) był niedostępny w środowisku agenta; komponenty pobrane z repozytorium źródłowego. W normalnym środowisku dodawać przez `npx shadcn add` w `packages/ui`.
- Do potwierdzenia przez właściciela: npm workspaces zamiast pnpm / Turborepo.

## Realizacja
- Przebieg: `.ai/runs/2026-10-14-monorepo-foundation.md` (pełna weryfikacja z dowodami).
- Pakiety: `packages/{core,db,ui,app,mockups}`; reguły architektury w `AGENTS.md` §1 i `packages/*/AGENTS.md`; opis w `README.md`.
- Odstępstwa od planu i decyzje podjęte w trakcie:
  - **npm ≥ 11.6 wymagany** (`packageManager`, `engines`, `engine-strict`): npm 10 nie instaluje Vitest 5 (lekcja `npm-11-for-vitest-5`).
  - Profile dań i win jako **embeddable** (kolumny `profile_*`), wiersze importu jako jsonb w `import_job.rows`; encje User, Membership, PublishedVersion, Recommendation, GuestSession, SalesRecord, EngineVersion, CatalogWine odłożone. `docs/DATA_MODEL.md` ma sekcję „Stan implementacji”.
  - Endpoint rekomendacji wymaga parametru `restaurant` (izolacja tenantów); `docs/API_SPECIFICATION.md` zaktualizowany.
  - Mockupy podniesione do Vite 8.3.1 (jedna linia Vite z Vitest 5).
  - Kontrakt repozytoriów (`core/src/testing`) uruchamiany na pamięci i na PostgreSQL.
  - Dodano `npm run engine:matrix` (wcześniej tylko fragment kodu w lekcji).
  - Komponenty shadcn pobrane ze źródeł repozytorium shadcn-ui (rejestr niedostępny w środowisku agenta).
- **Nadal do potwierdzenia przez właściciela:** npm workspaces zamiast pnpm / Turborepo; wymaganie npm 11.
