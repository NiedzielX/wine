---
date: 2026-10-17
updated:
area: guest-ui
status: active
source: .ai/runs/2026-10-16-e02-f1-usage-events.md
promoted:
---

# `headers()` w Next.js 16 ukrywa nagłówki routera — prefetch rozpoznawaj w proxy

## Kontekst
E02 F1 miał pomijać zapis zdarzeń użycia dla prefetchu routera (`Next-Router-Prefetch`). Plan zakładał sprawdzenie nagłówka w komponencie serwerowym przez `headers()`.

## Przyczyna
`next/dist/server/async-storage/request-store.js` pieczętuje widok `headers()` dla kodu aplikacji i chowa w nim `HIDDEN_REQUEST_HEADERS` = `FLIGHT_HEADERS` (`RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`, HMR) oraz identyfikatory żądań dev. W stronie `headers().get('next-router-prefetch')` jest zawsze `null`. Proxy (`src/proxy.ts`) widzi surowe nagłówki.

## Reguła
- Gdy strona musi wiedzieć o prefetchu lub żądaniu RSC, oznacz to w proxy własnym nagłówkiem żądania (u nas `x-wine-prefetch: 1`, stała w `server/prefetch.ts`) i zawsze go nadpisuj/usuwaj, żeby klient nie mógł go podać sam.
- Moduł ze stałą dla proxy trzymaj osobno od kodu tylko‑serwerowego (proxy nie może ładować `next/headers`, loggera ani kontenera).
- `after()` z `next/server` wykonuje się też po `notFound()`/`redirect()` — wołaj go jako ostatnią instrukcję przed `return`.

## Jak sprawdzić
`tests/unit/usage-events.test.ts` („the proxy marks router prefetches…”) i E2E `usage-events.e2e.test.ts` (prefetch z JS nie tworzy zdarzeń). Ręcznie: `grep -n HIDDEN_REQUEST_HEADERS node_modules/next/dist/server/async-storage/request-store.js`.
