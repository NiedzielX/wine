---
started: 2026-10-18 10:00
ended: 2026-10-18 13:00
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/2026-10-16-how-it-works-explanations.md
outcome: success
related: [.ai/runs/2026-10-16-e07-f1a-engine-facts.md, .ai/runs/2026-10-16-e07-f1b-explain-component.md, .ai/runs/2026-10-16-e07-f3-panel-explanations.md, .ai/runs/2026-10-17-e08-f3-guest-whole-table.md, .ai/runs/2026-10-16-e02-f1-usage-events.md]
---

# E07 faza 2 — wyjaśnienia na G0, G1, G5, G6, G9 i strona G12 „Jak dobieramy wino”

## Zadanie
Zaimplementować wyłącznie fazę 2 specyfikacji E07 (issue #39, epic #36): `Explain` z treściami na G0, G1, G5, G9; punkty E07 dopisane do istniejącego `guest.explain.tableResult` na G6 (bez drugiego „i”); pieczęć zdjęta z nagłówka karty G6 (AC11); nowa strona G12 `/r/{slug}/how-it-works` z linkami z G0 i ze stopki G3 (linki przez `href` z `guestContext`, więc z `lang` i `sid`); zdarzenie odsłony G12 (Q9, E02 wdrożone). G8 poza zakresem tego przebiegu (równolegle E09 F1 zmienia G8 — polecenie: nie dotykać G8). Docs: `SCREEN_SPECIFICATION.md`, `SCREEN_MAP.md`, BC §1. PR do `main`, bez merge.

## Przebieg
- Gałąź `feat/e07-f2-guest-explanations` z `origin/main` (`f442008`, po E08 F3 i E02 F2+F3). Przeczytane: AGENTS.md, CLAUDE.md, `packages/app/AGENTS.md`, `.ai/lessons.md` + lekcje `ssr-page-tests-with-prerender`, `e2e-without-javascript`, `nextjs-headers-hide-router-prefetch`, SDLC.md, BC §1.
- Stan wyjściowy: G6 ma już `Explain` `tableResult` z akapitem E08 (surowy wynik na danie, premia tylko w wyniku stołu); G3 ma stopkę bez linku do G12; G0/G1/G5/G9 bez wyjaśnień; G8 bez wyjaśnienia (zostaje — patrz Wynik).
- Słowniki: `guest.explain.{landing,menu,table,staff}` i przepisany `tableResult` (punkty E07 w tym samym kluczu: paski, wagi, premia tylko w wyniku ogółem, limit odrzuconej, kieliszki przy kompromisie — `compromiseThreshold`, `weakDishThreshold`); pierwsza wersja wariantu bez procentów miała 97 słów (test limitu R4) — skrócona. `guest.howItWorks.sections(f, ctx)` zwraca sekcje `{ id, title, text, points?, after? }`; płeć Wine Directora nie jest zakładana (PL „poleca je”, nie „wybrał”).
- Komponenty: `RecoFooter` (`howHref`), `WineDirectorNote` (`howHref`, linki 44 px), `RestaurantHero` (`howHref` obok linku dla obsługi, pełny `on-wine` bez przezroczystości). Strony: G0, G1, G5, G6 (bez `Seal` w nagłówku), G9, G3 (link w stopce), nowa G12.
- Q9: `explainer_viewed` w `GUEST_EVENT_NAMES` i `UsageEvent` (kolumna `name` to zwykły tekst — bez migracji), zapis na G12.
- Testy: nowy `tests/unit/how-it-works.test.ts`, rozszerzone `usage-events.test.ts` i `explain.test.ts`, nowy E2E `how-it-works.e2e.test.ts` (bez JS według lekcji `e2e-without-javascript`; lokalnie brak `agent-browser` — sprawdza CI), smoke.
- Docs: `SCREEN_SPECIFICATION.md`, `SCREEN_MAP.md`, `BACKWARD_COMPATIBILITY.md` §1; spec — notka F2 w „Realizacja”, status zostaje `in-progress` (G8).

## Weryfikacja
- `npm run lint` — 0 ostrzeżeń; `npm run check:boundaries` — OK; `npm run typecheck` — OK.
- `npm test` — core 405, db 44, testkit 9, app 234 (+25: 24 w `how-it-works.test.ts`, 1 w `usage-events.test.ts`), ui 10 — zielone.
- `npm run build` — OK (`ƒ /r/[slug]/how-it-works`).
- `next start` (`DATA_SOURCE=memory ALLOW_DEMO_DATA=true`, port 3247) + `npm run smoke -- http://localhost:3247 halka` — 232 × ok, „All smoke checks passed”. PostgreSQL / E2E — w CI.
- QA w panelu przeglądarki (emulacja 390 × 844 i 1440 × 900; „bez JS” przez lokalny proxy usuwający `<script>`, `document.scripts.length = 0`, `window.next` niezdefiniowane):
  - 390 PL, „i” otwarte i zamknięte: `scrollWidth = 390` na G0, G1, G5, G6, G9, G12; zamknięte `summary` 44 px wysokości (jeden wiersz). Pozycje: G0 `summary` 587 px, pierwsze danie 758 px; G1 `summary` 175, pierwsze danie 346; G5 `summary` 223, pierwsze danie 356; G6 `summary` 168, karta 236 (nagłówek karty bez `svg`); G9 `summary` 129, pierwsze wino 633; G3 pierwsza karta 330 px (AC15 ≤ 520), link do G12 w stopce.
  - 390 EN (iframe 390 px): `scrollWidth = 390` na wszystkich sześciu ekranach z otwartym „i”.
  - Bez JS: G0 — dotknięcie „Jak dobieramy wino?” otwiera treść (4 punkty, Marta Wierzbicka); link „Więcej o doborze win” → G12 `?lang=pl&sid=…`, `h1` „Jak dobieramy wino”, dwa linki powrotu `/r/halka?lang=pl&sid=…`; G6 EN — „How is the overall match worked out?” otwiera 4 punkty (60/40%, ×1.5, 70%, 3 pkt, 50%, 76% / 64%), pieczęcie tylko przy risotto i kaczce.
  - 1440 EN/PL z JS: `scrollWidth = 1440` na G0 (link do G12 widoczny w nagłówku restauracji, 44 px), G1, G5, G6, G9, G12 (323 słowa); konsola bez błędów.

## Wynik
Faza 2 bez G8: wyjaśnienia G0, G1, G5, G6 (dopisane do klucza E08), G9; pieczęć zdjęta z nagłówka G6; strona G12 z linkami z G0 i G3 i zdarzeniem `explainer_viewed`. Zostaje: `Explain` na G8 (`guest.explain.selected`) — G8 zmienia równolegle E09 F1; ręczne sprawdzenie czytników ekranu. Specyfikacja `in-progress`.

## Lekcje
brak (nic nieoczywistego ponad istniejące lekcje `ssr-page-tests-with-prerender` i `e2e-without-javascript`)
