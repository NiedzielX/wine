---
date: 2026-10-19
updated:
area: tooling
status: active
source: .ai/runs/2026-10-19-ui-storybook-a11y.md
promoted:
---

# Axe w testach Vitest (jsdom) nie mierzy kontrastu: kontrast sprawdzaj z tokenów

## Kontekst
Test dostępności `packages/ui/tests/a11y.test.tsx` renderuje stories do markupu i uruchamia `axe-core` w jsdom. jsdom nie ma layoutu ani canvas: `color-contrast` nie może obliczyć kolorów, a jsdom wypisuje „Not implemented: HTMLCanvasElement’s getContext()” dla każdego sprawdzenia.

## Przyczyna
Reguła `color-contrast` wymaga renderowania w przeglądarce. W jsdom axe zwraca wynik „incomplete”, a nie naruszenie, więc test przeszedłby bez sprawdzenia kontrastu.

## Reguła
W axe uruchamianym w jsdom wyłącz `color-contrast` jawnie (`rules: { 'color-contrast': { enabled: false } }`) i napisz w komentarzu, dlaczego. Kontrast tokenów sprawdzaj osobno funkcją liczącą WCAG na wartościach z `src/styles.css` (`src/stories/contrast.ts`, testy w `tests/contrast.test.ts`). Asercja niepustego markupu chroni przed przejściem pustego renderu.

## Jak sprawdzić
Test kontrolny: `<input />` bez etykiety i `<img>` bez `alt` dają w axe naruszenia `label` i `image-alt` (usunięty po sprawdzeniu). `npm test -w @wine-match/ui` przechodzi z `a11y.test.tsx` i `contrast.test.ts`.
