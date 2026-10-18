---
started: 2026-10-18 15:35
ended: 2026-10-18 16:05
agent: Claude Code / claude-opus-5-5
spec: .ai/specs/implemented/2026-10-16-how-it-works-explanations.md
outcome: success
related: [.ai/runs/2026-10-18-e07-f2-guest-explanations.md, .ai/runs/2026-10-17-e09-f1-recommendation-code.md, .ai/specs/2026-10-16-recommendation-code.md]
---

# E07 — wyjaśnienie „i” na G8 („Co dalej?”) z akapitem o kodzie polecenia E09; zamknięcie specyfikacji

## Zadanie
Dokończyć E07: brakowało tylko wyjaśnienia na G8 (`/r/{slug}/selected/[wineId]`, Inwentaryzacja G8, R3, AC2, Q15). Na `main` jest już kod polecenia E09 F1 i gotowe zdanie `guest.selected.code.explain`; G8 ma mieć jedno „i” (`guest.explain.selected`) z punktami E07 i — tylko gdy kod jest wyświetlony — zdaniem o kodzie. Nie dotykać G9/G11 (równoległy agent). Po spełnieniu AC: `status: implemented`, „Realizacja”, `git mv` do `implemented/`. Mały PR zamykający #39 (epic #36).

## Przebieg
- Worktree: gałąź `feat/e07-g8-explanation` z `origin/main` (`0f93477`, E09 F1). Przeczytane: spec E07 (Inwentaryzacja, R3, R4, AC2, AC13, Q13, Q15, „Realizacja” F2 — odstępstwo 1), spec E09 (G8, krok 5), `AGENTS.md`, `packages/app/AGENTS.md`, lekcja `ssr-page-tests-with-prerender`.
- Słowniki: `guest.explain.selected` w `en.ts` / `pl.ts` — `summary` „What happens next?” / „Co dalej?” i dwa punkty ze szkicu (wybór ≠ zamówienie, nic nie płacisz w aplikacji; pokaż ekran kelnerowi). Bez liczb (nic z `ENGINE_FACTS` nie dotyczy G8), więc stała lista zamiast funkcji `(facts)`. Komentarz przy `guest.selected.code.explain` zaktualizowany (już nie „G8 has no explanation yet”).
- Strona G8: `Explain id="selected"` po `CodeForWaiter`, przed przyciskami; punkty = punkty E07 + `l.code.explain` tylko przy `issued?.code`. Wino nieaktywne — bez „i” (komunikat zamiast karty, nie ma wyboru). `className="w-full text-left"`, bo kontener jest wyśrodkowany, a lista z punktorami czyta się źle wyśrodkowana.
- Test: nowy `packages/app/tests/unit/selected-explain.test.ts` (render SSR przez `prerender`, UA Safari jak w `recommendation-code.test.ts`, brak kodu przez nagłówek ruchu własnego). Osobny plik zamiast dopisywania do `how-it-works.test.ts`, bo G8 potrzebuje UA i sprzątania `afterTasks`.
- Smoke: G8 EN `data-explain="selected"`, „What happens next?”, bez zdania o kodzie (smoke wysyła `x-wine-match-synthetic: 1`, więc kodu nie ma); G8 PL „Co dalej?”.
- Docs: `SCREEN_SPECIFICATION.md` — wiersz „Wyjaśnienie” G8, poprawiony opis bloku kodu i wspólna zasada „Wyjaśnienia”.
- Spec: `status: implemented`, AC zaznaczone, wpis „G8” w „Realizacja”, changelog, `git mv` do `.ai/specs/implemented/`. Odnośników do starej ścieżki w innych specyfikacjach (E08, E09, E10, brief, backlog) nie zmieniałem — E08 edytuje równolegle inny agent, a dotychczasowe przeniesienia (E02) też ich nie poprawiały.

## Weryfikacja
- `npx -y npm@11.20.0 install` — OK.
- `npx vitest run selected-explain explain-pages recommendation-code explain` (app) — 4 pliki, 47 testów zielone.
- `npm run lint` — 0; `npm run check:boundaries` — 0; `npm run typecheck` — 0; `npm test` — core 428, db 44, testkit 9, app 250 (16 plików), ui 10 — zielone; `npm run build` — 0.
- `next start` (`DATA_SOURCE=memory ALLOW_DEMO_DATA=true`, port 3187) + `npm run smoke -- http://localhost:3187 halka` — „All smoke checks passed” (w tym `G8 confirmation (glass)`, `G8 in Polish`).
- Bez JS (HTML serwera, `curl`): EN i PL, z kodem (UA Safari) i bez kodu (`x-wine-match-synthetic: 1`) — dokładnie jedno `data-explain="selected"`, `<details …><summary` jako pierwsze dziecko, bez `open`; zdanie o kodzie w HTML poza `<script>` 1× z kodem, 0× bez kodu. Natywne `<details>` otwiera się bez skryptu.
- Panel przeglądarki:
  - 390 × 844, EN, danie (kaczka), z kodem `M7M`: jedno „i”, `summary` 44 px (jeden wiersz), po otwarciu 3 punkty (z kodem), `scrollWidth = 390`.
  - 390 × 844, PL, `sid` z wyczerpanym limitem 30 kodów (54 wybory przez `curl` z UA Safari): „Kod niedostępny — poleć wino słownie.”, „Co dalej?” z 2 punktami (bez zdania o kodzie), `scrollWidth = 390`.
  - 1440 × 900, EN, butelka stolika (tatar + kaczka), kod `Y2P`: 3 punkty, `scrollWidth = 1440`, konsola bez błędów.
- Nie sprawdzone: PostgreSQL i E2E (w CI), czytniki ekranu (VoiceOver / TalkBack — QA ręczne, jak w F1b/F2).

## Wynik
G8 ma jedno wyjaśnienie z akapitem o kodzie tylko przy wyświetlonym kodzie; E07 kompletna, spec w `implemented/`. Do QA ręcznego: czytniki ekranu (AC3) i przegląd treści przez sommeliera (AC17).

## Lekcje
brak
