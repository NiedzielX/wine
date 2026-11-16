---
date: 2026-11-16
updated:
area: tooling
status: active
source: .ai/runs/2026-11-16-menu-transition-diagnosis.md
promoted:
---

# Skakanie ekranu mierz z klasycznym paskiem przewijania, opóźnioną siecią i surowymi przesunięciami

## Kontekst
Zgłoszenie „ekran skacze przy przejściach w menu”. Pierwszy pomiar w headless Chromium (Playwright) pokazał CLS = 0 na każdym przejściu, choć szerokość strony zmieniała się o 15 px dwa razy w ~300 ms.

## Przyczyna
- Playwright startuje Chromium z `--hide-scrollbars`: pasek przewijania (15 px) nie istnieje, więc jego znikanie i pojawianie się (brak `scrollbar-gutter`) jest niewidoczne.
- API `layout-shift` ustawia `hadRecentInput` i CLS nie liczy przesunięć w ciągu 500 ms od kliknięcia; lokalny serwer odpowiada w 40–100 ms, więc każde przejście wygląda na stabilne.
- `locator.click()` sam przewija element do widoku i fałszuje pomiar `scrollY` po kliknięciu.
- Zagnieżdżony worktree nie ma `node_modules`; symlinki do głównego checkoutu psują Turbopack („Could not find the Next.js package”), działa kopia `cp -a`.

## Reguła
- Uruchamiaj przeglądarkę z `ignoreDefaultArgs: ['--hide-scrollbars']`.
- Mierz `clientWidth` i `scrollY` w każdej klatce (`requestAnimationFrame`) oraz sumuj przesunięcia surowe, także z `hadRecentInput`; dodaj opóźnienie dokumentów i RSC (`page.route`, 500–600 ms), żeby zobaczyć stany pośrednie.
- Pozycję przewijania sprawdzaj klikając przez `element.click()` w DOM, nie `locator.click()`.
- Sondy gotowe: `.ai/analysis/menu-transition-probes/`.

## Jak sprawdzić
`node .ai/analysis/menu-transition-probes/admin3.mjs` (po `next start -p 3111`): zbiór `clientWidth` jednego przejścia ma jedną wartość.
