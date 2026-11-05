---
started: 2026-11-04 12:00
ended:
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-04-platform-quality-and-compliance.md (branch docs/product-completion-plan, PR #105, not yet on main)
outcome: partial
related: []
---

# E21 F1: metryki i strukturalne logowanie żądań

## Zadanie
Faza F1 specyfikacji E21 (risk: medium): R1 (endpoint metryk), R2 (wiersz logu na żądanie API w `guarded()`), R3 (`onRequestError` i handlery procesu), R4 (`docs/OPERATIONS.md`), kryteria AC1, AC2, AC3. Bez nowych zależności. Specyfikacji nie edytuję (leży na innej gałęzi).

## Przebieg
- Gałąź `feat/e21-f1-metrics-and-logs` z `origin/main` (16fbba5). Przeczytane: AGENTS.md, packages/app/AGENTS.md, `.ai/lessons.md`, SDLC, spec E21 i plan.
- Weryfikacje „do zweryfikowania” ze specyfikacji:
  - `onRequestError`: zainstalowany Next to 16.3.8 (AGENTS.md mówi 16.3.7). Sygnatura z `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` i `dist/server/instrumentation/types.d.ts`: `(error: unknown, request: {path, method, headers}, context: {routerKind, routePath, routeType, renderSource, revalidateReason, renderType})`. `request.path` zawiera query string, a `headers` zawierają cookie: hook nie loguje nagłówków i obcina query.
  - Redakcja: `core/src/logging/redact.ts` maskuje `postgres://u:haslo@h/db` w komunikacie, stosie i `cause` (potwierdza test w tym PR).
  - Next (`router-server.js`) sam rejestruje `uncaughtException` i tylko loguje: proces nie ginie. Nasze handlery także tylko logują i liczą (bez `process.exit`), żeby nie zmienić zachowania.
