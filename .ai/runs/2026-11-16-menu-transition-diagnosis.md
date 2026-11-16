---
started: 2026-11-16 10:00
ended: 2026-11-16 12:10
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-11-16-menu-transition-smoothness.md
outcome: partial
related: []
---

# Diagnoza skakania ekranu przy przejściach w menu (panel i gość)

## Zadanie
Zgłoszenie właściciela: „Klikam coś w menu i chciałbym, żeby te przejścia były bardziej płynne. Teraz to skakanie ekranu jest denerwujące.” Etap 1: zmierzyć przyczynę (panel i gość, 390/1440 px), tylko odczyt i pomiary. Etap 2: specyfikacja `draft`, bez implementacji i bez `approved`. Dozwolona poprawka bez specyfikacji tylko dla jednego oczywistego błędu w jednym miejscu.

## Przebieg
- Gałąź `fix/menu-transition-smoothness` z `origin/main`. Przeczytane: `.ai/lessons.md` i lekcje `nextjs-loading-streams-and-http-status`, `sticky-bars-scroll-padding`, `server-action-layout-revalidate`, `css-grid-min-width`, `packages/app/AGENTS.md`, `packages/ui/AGENTS.md`.
- Środowisko: worktree zagnieżdżony nie ma `node_modules`; symlinki do głównego checkoutu psują Turbopack („Could not find the Next.js package”, pliki poza korzeniem), więc `cp -a` `node_modules` z głównego checkoutu i podmiana `@wine-match/*` na symlinki do worktree (katalog jest w `.gitignore`). `.env` skopiowany z `.env.example` (ignorowany przez git). Build: `DATA_SOURCE=memory next build`, start `next start -p 3111`.
- Pułapka pomiarowa 1: Playwright domyślnie startuje Chromium z `--hide-scrollbars`; pierwsza hipoteza (pasek przewijania) byłaby niewidoczna. Uruchamiałem z `ignoreDefaultArgs: ['--hide-scrollbars']`.
- Pułapka pomiarowa 2: CLS nie liczy przesunięć w ciągu 500 ms od kliknięcia; przy lokalnym serwerze wszystko ma CLS = 0. Dodałem opóźnienie sieci (`DELAY=500/600`, `page.route`) i raport przesunięć surowych oraz `clientWidth`/`scrollY` per klatka.
- Pułapka pomiarowa 3: Playwright `click()` sam przewija element (artefakt 200 → 171 / 0 przy chipach); powtórzone przez `element.click()` w DOM, wynik 150 → 150.
- Pułapka środowiska: formularz logowania nie zalogował przez Playwrighta (pozostał na `/admin/login`, w logu serwera brak błędu); zalogowanie przez `POST /api/v1/auth/login` i ciasteczko `wm_session` w kontekście przeglądarki. Przyczyny nie badałem (poza zakresem). Serwer w tle znikał między wywołaniami narzędzia; start serwera i sondy w jednym poleceniu.
- Odrzucone hipotezy: reset przewijania paska bocznego, zniknięcie układu po `revalidatePath(..., 'layout')`, obrazy bez wymiarów, utrata przewijania przy chipach gościa, poziome przewijanie panelu na 390 px, skakanie szerokości u gościa przy ≤ 1000 px wysokości.
- Decyzja: nie robię poprawki bez specyfikacji. Samo `scrollbar-gutter` to jedna z pięciu przyczyn (P1–P5); reszta to nowe komponenty i testy (> 3 plików, zmiana widoczna dla użytkownika). Opisane w „Ryzyka i otwarte pytania” specyfikacji.
- Przegląd specyfikacji pod-agentem: niewykonany, agent w tej sesji nie ma narzędzia do uruchomienia pod-agenta (tylko Bash/Edit/Read…). Zapisane w specyfikacji i tu; przegląd do zlecenia przed akceptacją.
- Pliki w repozytorium: `.ai/specs/2026-11-16-menu-transition-smoothness.md` (draft), `.ai/analysis/menu-transition-probes/*.mjs` (sondy pomiarowe, `eslint-disable no-console`), ten log. Zero zmian w kodzie aplikacji.

## Weryfikacja
Pomiary (zbudowana aplikacja, `DATA_SOURCE=memory`, Chromium z klasycznym paskiem 15 px; pełne liczby i opis metody w specyfikacji, sekcja „Problem”):

| Pomiar | Wynik |
|---|---|
| Panel 1440×800, 10 przejść paska bocznego | `clientWidth` 1425 ↔ 1440 w 7 z 10 przejść; przełącznik języka 1385 → 1400 → 1385 px w ~300 ms |
| Panel, przejście do listy (Menu/Wines/Review/Dashboard) | `h1` = null w 18–19 klatkach (~300 ms), wysokość dokumentu 1598/4707/2403 → 800 → z powrotem |
| Panel 1440×900, Opportunities → Publish → QR | `clientWidth` 1425 → 1440 → 1425 (bez szkieletu) |
| Panel, opóźnienie 500 ms, trasy poza `(lists)` | ~500–600 ms bez żadnej zmiany na ekranie, potem skok |
| Panel, pasek boczny przewinięty (`scrollTop` 214) | 214 po przejściu; 0 klatek bez `<aside>` (hipoteza odrzucona) |
| Panel 390 px, pasek zakładek | `scrollLeft` zachowany; `scrollWidth` dokumentu 390; aktywna zakładka poza widokiem po wejściu z linku |
| Panel, „Save note” przy `scrollY` 625 | po zapisie `scrollY` 0, wysokość dokumentu +66 px (baner) |
| Gość 390 / 1440, menu 991 / 808 px → danie → strzałka „wstecz” | `scrollY` 0; `history.back()` przywraca 991 / 808 |
| Gość, chip `serving=glass`, opóźnienie 600 ms | CLS 0,0824 (390), 0,0178 (1440); 685–735 ms bez reakcji |
| Zimne wczytanie, 390 px | CLS gość/danie 0,0686, panel/Review 0,0589 (FOUT); 1440 px ≤ 0,0042 |

Repo: `npm run lint` czysty, `npm run secrets:scan` czysty, `npm run check:context` 0 błędów, `node scripts/check-qa-scenarios.mjs` OK. `typecheck`, `npm test`, `npm run build` (repo) nie uruchamiane w całości: brak zmian w kodzie aplikacji; `next build` aplikacji wykonany na potrzeby pomiarów i zakończył się sukcesem.

## Wynik
Diagnoza kompletna (7 potwierdzonych przyczyn, 6 odrzuconych hipotez). Specyfikacja w statusie `draft`, czeka na przegląd niezależnym agentem i akceptację właściciela (`approved` ustawia człowiek). Nic nie zaimplementowane; outcome `partial` (etap 2 bez przeglądu pod-agentem).
Niezmierzone: Postgres (czas szkieletu), macOS z paskami nakładkowymi, przełącznik języka gościa (zwykły `<a>`, pełne przeładowanie), prawdziwe urządzenie mobilne.

## Lekcje
- `.ai/lessons/2026-11-16-measuring-layout-jumps-in-headless-chromium.md` (Playwright `--hide-scrollbars`, CLS pomija 500 ms po kliknięciu, `click()` przewija, `node_modules` w zagnieżdżonym worktree).
