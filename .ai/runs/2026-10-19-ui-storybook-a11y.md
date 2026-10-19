---
started: 2026-10-19 17:09
ended: 2026-10-19 17:55
agent: Claude Code / claude-haiku-5-5
spec: brak — polecenie właściciela (zakres PR „feat(ui): Storybook i testy dostępności”, decyzje podjęte autonomicznie)
outcome: success
related: []
---

# Storybook dla packages/ui i testy axe-core w `npm test`

## Zadanie
Właściciel (Filip) zlecił w całości, bez pytań: Storybook dla `packages/ui` (komponenty shadcn i marki, stany, „kiedy używać”, Foundations z kontrastem liczonym z `styles.css`, przełącznik motywu), wersje pakietów exact i co najmniej 14 dni po publikacji, skrypty `storybook` i `storybook:build` poza buildem aplikacji oraz testy axe-core (wcag2a, wcag2aa, wcag21aa) w zwykłym `npm test` ui. Bez zmian w `packages/app`, `ci.yml`, `guest.css`, `docs/DESIGN_SYSTEM.md`.

## Przebieg
- Data graniczna: dziś 2026-10-19, więc wydania po 2026-10-05.
- `storybook` 10.6.2 (2026-10-12) odrzucony jako zbyt świeży; wybrany 10.6.1 (2026-09-29), wraz z `@storybook/react-vite` i `@storybook/addon-docs` w tej samej wersji. Peer `vite` ^8 zgodny z Vite 8.3.1 z root, React 19 zgodny.
- `axe-core` 4.14.0 (2026-10-05 17:43 UTC) odrzucony: w chwili pracy miał 13 dni i 22 godziny, poniżej progu 14 dni; wybrany 4.13.0 (2026-08-05).
- `jsdom` 30.1.3 (2026-10-15) odrzucony, wybrany 30.1.2 (2026-10-04). Potrzebny do testów axe (vitest w środowisku `jsdom`); bez przeglądarki.
- `@tailwindcss/vite` 4.3.3 (2026-07-16), zgodny z `tailwindcss` 4.3.3 używanym przez aplikację; Storybook potrzebuje wtyczki do `styles.css`.
- Nie podniesiono żadnej istniejącej zależności. W `package-lock.json` zmieniła się jedna wersja tranzytywna: `baseline-browser-mapping` 2.11.28 → 2.11.29 (wymagana przez `browserslist`). Patch, zmiana wynika z instalacji, nie z ręcznego podbicia.
- Pierwsza instalacja była wykonana z `-w @wine-match/ui` w świeżym worktree i zostawiła niepełne `node_modules` (brak `vitest`). Pełna `npm install` naprawiła to; patrz lekcja `2026-10-19-full-install-before-adding-deps`.
- Stories: 15 plików w `packages/ui/src/stories/` (Button, Badge, Card, Table, Input, Textarea, NativeSelect, Label, Separator, Progress, Alert, Skeleton, LevelMeter, InfoDisclosure, MatchGlass) plus `foundations.stories.tsx` i moduł `contrast.ts`. Opisy „kiedy używać / nie używać” i stany (domyślny, hover, focus, disabled, błąd/pusty) w `parameters.docs.description`, zamiast osobnych MDX.
- `.storybook/main.ts` (Vite z `@tailwindcss/vite`, addon-docs), `.storybook/preview.tsx` (globalTypes `theme` w toolbarze, klasa `dark` na html i ramce).
- `contrast.ts`: czyta `:root` i `.dark` z `src/styles.css` przez `?raw`, liczy WCAG 2.x, rola tokenu decyduje o progu (tekst 4,5:1, granica pola i fokus 3:1, powierzchnie i dekoracja bez progu).
- Testy: `tests/a11y.test.tsx` (jsdom, `import.meta.glob` po wszystkich stories, renderowanie do statycznego markupu, `axe.run` z tagami wcag2a/wcag2aa/wcag21aa, asercja niepustego markupu); `tests/contrast.test.ts` (matematyka kontrastu, parsowanie tokenów, role, wiersze tabeli).
- `color-contrast` wyłączony w axe w jsdom (brak canvas i layoutu); kontrast tokenów sprawdza `contrast.test.ts` i strona Foundations.
- `tsconfig.json` ui: include `src` i `.storybook`. `.gitignore`: `storybook-static`.
- Skrypty: root `storybook` i `storybook:build` przez `npm run … -w @wine-match/ui`; w ui `storybook dev --no-open` i `storybook build -o storybook-static`, oba z `--disable-telemetry`. Root `build` bez zmian.

## Weryfikacja
- `npm run lint` — exit 0.
- `npm run check:boundaries` — „Package boundaries OK”.
- `npm run typecheck` (wszystkie pakiety) — exit 0.
- `npm test -w @wine-match/ui` — 4 pliki, 62 testy zielone; w tym 48 przypadków axe ze stories (plus test kontrolny poza repo: nieoznaczone `input` i `img` bez `alt` dają `label` i `image-alt`, co potwierdza, że axe w jsdom łapie naruszenia).
- `npm test` (root, wszystkie pakiety) — 19+4+4+23+2 plików, 547+48+62+337+10 testów, bez błędów.
- `npm run storybook:build` — „Storybook build completed successfully”, wyjście w `packages/ui/storybook-static` (ignorowane). Ostrzeżenia `MODULE_LEVEL_DIRECTIVE` dotyczą `"use client"` w Radix, nie naszego kodu.
- `npm run audit:gate` — passed (high: 4 — awilix, braces, fast-glob, micromatch — wszystkie już w drzewie produkcyjnym przed tą zmianą; braces z zaakceptowanym wyjątkiem do 2027-01-15; moderate 4 — testcontainers/dockerode/uuid, też wcześniej).
- `npm run check:design` — ok.
- Nie uruchamiano przeglądarki (zgodnie z poleceniem); Storybook zweryfikowany buildem.

## Wynik
- Co działa: wszystkie gate’y lokalnie; Storybook buduje się; testy axe i kontrastu w `npm test`.
- Wynik kontrastu z tokenów (do decyzji właściciela, nie zmieniono `styles.css`): token `input` jest poniżej 3:1 na tle jasnym (`#d4ccd0` na `#ffffff`). Pozostałe pola i tekst wg tabeli w Foundations.
- Ograniczenia: axe w jsdom nie mierzy kontrastu; fokus i hover nie są sprawdzane automatycznie (opisane w docs i story Focus); nie ma addona a11y w Storybook (poza zakresem).
- Nie dodano joba w CI (zgodnie z poleceniem); `npm test` w jobie `unit` uruchomi testy axe.
- Stories nie są w `packages/ui/src/index.ts` i nie wchodzą do builda aplikacji.

## Lekcje
- [2026-10-19-full-install-before-adding-deps](../lessons/2026-10-19-full-install-before-adding-deps.md)
- [2026-10-19-axe-in-jsdom-limits](../lessons/2026-10-19-axe-in-jsdom-limits.md)
