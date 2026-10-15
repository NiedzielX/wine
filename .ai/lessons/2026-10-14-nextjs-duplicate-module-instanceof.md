---
date: 2026-10-14
updated:
area: tooling
status: active
source: .ai/runs/2026-10-14-authentication.md
promoted: packages/app/AGENTS.md, scripts/check-boundaries.mjs
---

# W Next.js nie używaj `instanceof` ani nazw klas do rozpoznawania błędów z `core`

## Kontekst
Po dodaniu REST API zapisu każde żądanie, w którym serwis zgłaszał błąd domenowy (zły login, konflikt wersji, walidacja), kończyło się 500 zamiast 401 / 409 / 422. Na stronach i w akcjach serwerowych to samo działało.

## Przyczyna (dwie, nałożone)
1. **Dwie kopie modułu.** Next.js bundluje `@wine-match/core` osobno dla stron, akcji i route handlerów, a kontener DI (z serwisami) powstaje raz i jest współdzielony. Błąd rzucony przez serwis jest instancją klasy z *innej kopii* niż ta, którą importuje route handler, więc `e instanceof NotFoundError` jest `false`. Strony i akcje działały tylko dlatego, że trafiały do tego samego chunka.
2. **Zminifikowane nazwy klas.** Pierwsza próba obejścia (rozpoznawanie po `e.name`, ustawianym jako `new.target.name`) też zawiodła w buildzie produkcyjnym: minifikator zmienia nazwy klas, więc `name` to np. `"o"`.

## Reguła
- Błędy domenowe rozpoznawaj przez `domainError(e)` z `server/domain-errors.ts` (po stałym `name` i `code`), nigdy `instanceof`. `scripts/check-boundaries.mjs` zgłasza każde `instanceof <Coś>Error` w `packages/app`.
- Każda klasa błędu w `core` ustawia `this.name` jako **literał** (`'NotFoundError'`), nie `new.target.name`.
- Zachowanie zależne od buildu produkcyjnego sprawdzaj na `npm run build` + `npm start` (`npm run smoke`), nie tylko w testach jednostkowych i w `dev`.

## Jak sprawdzić
`npm run check:boundaries`; `npm run smoke` (login ze złym hasłem → 401, zły `If-Match` → 409, za długa notatka → 422).
