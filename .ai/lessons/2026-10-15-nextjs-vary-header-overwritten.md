---
date: 2026-10-15
updated:
area: build
status: active
source: .ai/runs/2026-10-15-polish-language-guest.md
promoted:
---

# Next.js 16 nadpisuje `Vary` stron App Routera — nie ustawisz go z proxy ani z `next.config`

## Kontekst
Spec `2026-10-15-polish-language` (R12) chciał `Vary: Accept-Language` na `/r/*` i `/admin/*`. Nagłówek ustawiony w `src/proxy.ts` (`res.headers.set('Vary', …)`) i w `next.config.ts` `headers()` nie dochodził do klienta: odpowiedź `next start` miała tylko `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding`.

## Przyczyna
`next/dist/build/templates/app-page-runtime.js` przed renderowaniem strony woła `res.setHeader('Vary', routeModule.getVaryHeader(…))`, co zastępuje wszystko, co ustawiono wcześniej. Test jednostkowy proxy (`res.headers.get('vary')`) przechodził, więc tylko sprawdzenie na działającym serwerze to wykrywa.

## Reguła
- Nie obiecuj w specyfikacji nagłówka `Vary` dla stron App Routera bez sprawdzenia `curl -D -` na `next start`.
- Dopóki strony są `force-dynamic` z `Cache-Control: private, no-store`, język z `Accept-Language` nie trafi do cache. Przed włączeniem cache stron rozdziel języki adresem (np. `lang` w URL) albo zweryfikuj nową wersję Next.js.

## Jak sprawdzić
`curl -s -D - -o /dev/null -H 'Accept-Language: pl' http://localhost:<port>/r/halka | grep -i vary`
