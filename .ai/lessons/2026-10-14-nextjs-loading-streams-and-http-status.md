---
date: 2026-10-14
updated:
area: admin-ui
status: active
source: .ai/runs/2026-10-14-admin-readonly-screens.md
promoted: packages/app/AGENTS.md
---

# `loading.tsx` strumieniuje stronę: `notFound()` i `redirect()` dają wtedy status 200, a treść wymaga JavaScriptu

## Kontekst
Po dodaniu `loading.tsx` w `admin/[slug]` smoke test wykrył: nieistniejące danie / wino zwracało 200 zamiast 404, a `/pairings` (z `redirect()`) zwracało 200 bez przekierowania.

## Przyczyna
`loading.tsx` opakowuje stronę w Suspense i Next.js zaczyna wysyłać odpowiedź (200) zanim strona sprawdzi dane. Późniejsze `notFound()` renderuje stronę 404 w tej samej odpowiedzi, a `redirect()` staje się `<meta http-equiv="refresh">`. Treść strumieniowana trafia do ukrytego `<div hidden id="S:n">` i jest wstawiana skryptem `$RC` — bez JavaScriptu zostaje szkielet.

## Reguła
- Strony, które mogą zwrócić `notFound()` lub `redirect()` (szczegóły, indeksy przekierowujące), umieszczaj **poza** zasięgiem `loading.tsx`. W panelu: `loading.tsx` jest w grupie tras `[slug]/(lists)/`, obok tylko ekrany list.
- Strony gościa nie mają `loading.tsx` — muszą zwracać poprawne kody i działać bez JS.
- Ekrany list panelu wymagają JavaScriptu (strumieniowanie) — to świadomy kompromis dla panelu desktopowego.
- Każdą trasę z `notFound()` / `redirect()` obejmij smoke testem sprawdzającym **kod HTTP**, nie tylko treść.

## Jak sprawdzić
`curl -s -o /dev/null -w '%{http_code}' <adres nieistniejącego dania>` → 404; `npm run smoke`.
