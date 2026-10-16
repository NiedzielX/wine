---
date: 2026-10-16
updated:
area: tooling
status: active
source: .ai/runs/2026-10-16-e07-f1b-explain-component.md
promoted:
---

# Strony serwerowe testuj w Vitest przez `react-dom/static` `prerender`, nie tylko przez E2E

## Kontekst
E07 F1b wymagał sprawdzenia struktury HTML stron gościa (jedno `<details>` na ekran, nigdy w `<a>` / `<button>` / `<p>`, brak `MatchGlass` bez wyniku, warianty ustawień restauracji) bez przeglądarki. Testy jednostkowe `app` obejmowały dotąd tylko trasy API i akcje, a strony — wyłącznie E2E (PostgreSQL + `agent-browser`, niedostępne lokalnie bez Dockera).

## Przyczyna
Strony App Routera to asynchroniczne komponenty serwerowe; `renderToStaticMarkup` ich nie wyrenderuje, ale `prerender` z `react-dom/static` czeka na `async` komponenty. Atrapy `next/headers` i `next/navigation` z `tests/unit/setup.ts` wystarczają (`x-wine-lang` ustawia język), a `DATA_SOURCE=memory` daje dane demo.

## Reguła
- Test HTML strony: `const { prelude } = await prerender(createElement(Page, { params: Promise.resolve({ slug: 'halka', … }), searchParams: Promise.resolve({ … }) }))`, potem `await new Response(prelude).text()` i `.replace(/<!-- -->/g, '')` (lekcja `ssr-html-assertions-and-test-races`).
- Pliki testów w `app/tests/unit` są `.ts` — używaj `createElement`, nie JSX.
- Identyfikatory danych demo bierz z serwisów (`createRequestScope().cradle`), nie wpisuj UUID-ów; ustawienia restauracji zmieniaj przez `publishService.updateSettings` i przywracaj w `afterEach`.
- Zagnieżdżenie elementów sprawdzaj prostym stosem tagów (przykład: `placementProblems` w `tests/unit/explain-pages.test.ts`).
- Zrzuty 390 px: Chrome headless na macOS ma minimalną szerokość okna ok. 500 px i przycina układ — do zrzutów telefonu używaj emulacji widoku (panel przeglądarki, `agent-browser set viewport`); headless tylko dla ≥ 768 px.

## Jak sprawdzić
`npx vitest run --root packages/app tests/unit/explain-pages.test.ts` przechodzi bez serwera i bez bazy.
