---
started: 2026-10-15 18:50
ended: 2026-10-15 19:40
agent: Claude Code / claude-opus-5-5 (sub-agent)
spec: .ai/specs/implemented/2026-10-15-polish-language.md
outcome: success
related: [.ai/runs/2026-10-15-polish-language-guest.md]
---

# Polska wersja językowa — faza 2 (panel)

## Zadanie
Faza 2 zatwierdzonej specyfikacji: R4, R5, R9, R12, R13 dla panelu (A0–A12), ciasteczko `wm_lang`, przełącznik „PL | EN”, komunikaty po kodzie, `format.ts` przez `Intl`, BC §5. Gałąź `feat/i18n-panel`, bez commitów. Infrastruktura z fazy 1 (`core/i18n/locale.ts`, `i18n/en.ts`/`pl.ts`, `server/i18n.ts`, `proxy.ts`) użyta bez zmian w logice.

## Przebieg
- Słownik `admin.*` (meta, nawigacja, role, kategorie, składniki/obróbka, logowanie, błędy, flash, odznaki, wszystkie ekrany, import z uwagami po kodzie) w `en.ts`; `pl.ts` `satisfies Dictionary` (polskie liczby mnogie przez `plural`).
- Przełącznik: akcja `setLanguage` (`language-actions.ts`) + `languageBack` w `server/auth.ts` + `server/lang-cookie.ts` (nazwa i atrybuty; proxy importuje stąd). `LanguageSwitch` jest kliencki, bo layout panelu przeżywa nawigację kliencką i `back` z pierwszego renderu byłby nieaktualny (sprawdzone w przeglądarce: Menu → Karta win klientem → EN wraca na Kartę win).
- Core: kody i `params` dla każdej uwagi importu, `SetupStep.state`/`values`, `locale` w czterech metodach `AdminService` (wyniki niezależne od języka — test).
- `error.tsx` (kliencki) dostaje teksty z kontekstu ustawianego w `[slug]/layout.tsx`.
- `LevelMeter` / `MatchGlass` z opcjonalnym `label` (aria) — domyślnie EN, `ui` nie zna `app`.
- Docs: BC §5 (`wm_lang`), SCREEN_SPECIFICATION (język panelu), `packages/app/AGENTS.md`, spec (Realizacja, AC, `implemented/`), link w briefie (D11).

## Weryfikacja
- `npm run lint` 0, `npm run typecheck` 0, `npm run check:boundaries` 0, `npm test` 0 (core 295, app 94 + pozostałe pakiety), `npm run build` 0.
- `DATA_SOURCE=memory ALLOW_DEMO_DATA=true AUTH_COOKIE_SECURE=false PORT=3003 npm start` + `node scripts/smoke.mjs http://localhost:3003 halka` → „All smoke checks passed” (188 ok), w tym nowe: A0 PL z `Accept-Language`, cookie wygrywa z przeglądarką, A1/A2/A4/A6/A7/A10/A11/A12 z `wm_lang=pl` (nawigacja, flash po kodzie, NBSP w cenach, tytuł „Pulpit | Panel Wine Match”), podgląd importu PL (uwagi po kodzie), strona gościa z `wm_lang=pl` po angielsku, POST akcji `setLanguage` bez JS (303, `wm_lang=pl; Path=/admin; Max-Age=31536000; HttpOnly; SameSite=lax`, bez dotykania sesji; obcy adres → `/admin`).
- Przeglądarka (panel aplikacji, `next start` :3003): A0 przy 390 px po kliknięciu PL — `scrollWidth == innerWidth`; po zalogowaniu (konto demo) A1, A2, A4, A6, A7, A10, A11 przy 1440 px bez poziomego przewijania; przełączenie na EN po nawigacji klienckiej wraca na tę samą stronę. Brak błędów konsoli poza własną próbą iframe (X-Frame-Options DENY, oczekiwane).

## Wynik
Faza 2 gotowa; spec `implemented`. Do zrobienia: E2E panelu PL (AC8), zrzuty A1/A6 przy 390 px (AC7), przegląd słownictwa przez sommeliera (A7 specyfikacji: np. „Parowania”, „Do przeglądu”, „Najlepsza cena”, nazwy obróbki), nazwa „Removed wine” w historii z core po angielsku. `Vary` (R12) — jak w fazie 1.

## Lekcje
- Brak nowych (layout przeżywający nawigację kliencką → `usePathname` w przełączniku opisany w komentarzu komponentu).
