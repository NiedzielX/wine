---
date: 2026-10-14
updated:
area: build
status: active
source: .ai/runs/2026-10-14-monorepo-foundation.md
promoted: AGENTS.md §1.1 (stos), packages/app/AGENTS.md
---

# TypeScript 7 nie ma klasycznego API JS — narzędzia muszą używać CLI `tsc`

## Kontekst
Projekt używa TypeScript 7.0 (natywny kompilator). Pakiet `typescript` ma tylko `bin/tsc` i eksperymentalne `unstable/*`; brak `lib/typescript.js`, z którego wiele narzędzi korzysta.

## Przyczyna i objawy
- Next.js domyślnie sprawdza typy przez API JS — z TS 7 potrzebuje `experimental.useTypeScriptCli: true` (Next 16.3 obsługuje to i rozpoznaje bin TS 7).
- TS 6+ domyślnie sprawdza importy efektów ubocznych: `import '@fontsource-variable/…'` i `import './x.css'` wymagają deklaracji `declare module`.
- Z `lib: ["ES2023"]` (bez DOM i bez typów Node) nie ma `structuredClone` — w `core` deklaracja w `src/globals.d.ts`.
- MikroORM: tylko `defineEntity` (bez dekoratorów i refleksji typów); CLI ładuje konfigurację TS przez `tsx`.

## Reguła
- Nie usuwaj `experimental.useTypeScriptCli` z `next.config.ts`.
- Nowe narzędzie, które „potrzebuje TypeScriptu”, sprawdź przed dodaniem: czy działa z TS 7 przez CLI, a nie przez `require('typescript')`. Jeśli nie — specyfikacja i fallback (np. `typescript@6` tylko w jednym pakiecie).
- Po zmianie konfiguracji buildu sprawdź, że typecheck naprawdę działa: wstrzyknij celowy błąd typu i upewnij się, że `next build` się zatrzymuje.

## Jak sprawdzić
`npm run typecheck`; `npm run build -w @wine-match/app` pokazuje „Running TypeScript”; celowy błąd typu kończy build kodem 1.
