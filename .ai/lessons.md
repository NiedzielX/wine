# Lekcje projektu Wine Match

Indeks pamięci długoterminowej agentów AI i zespołu. Zasady prowadzenia: `AGENTS.md`, sekcja 5.

**Każdy agent czyta ten plik na początku sesji.** Pełna treść lekcji: `.ai/lessons/`.

Format linii (najnowsze na górze):
`- [YYYY-MM-DD] [Tytuł jako reguła](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`

## Aktywne

- [2026-10-25] [Konfiguracja agenta w repo: `deny` nie blokuje basha, sandbox na Linuksie ma prywatny localhost, hook zawodzi zamykająco](lessons/2026-10-25-agent-config-in-repo.md) — buduj granice warstwami (deny, hook w Node, sandbox), wylicz sekrety w `deny`, nie włączaj sandboxa we wspólnym pliku bez testu.
- [2026-10-25] [Przy pytaniu z rekomendacją wykonaj ją i zapisz wybór, nie wstrzymuj pracy](lessons/2026-10-25-recommended-decision-default.md) — pytaj tylko bez rekomendacji albo przy decyzji nieodwracalnej lub wychodzącej na zewnątrz.
- [2026-10-25] [Nowy advisory czerwieni CI wszystkich PR-ów; gdy poprawka jest młodsza niż 14 dni, daj dateowany wyjątek dla nazwanych advisories](lessons/2026-10-25-audit-gate-new-advisories.md) — wyjątek w `audit-gate` wymienia advisories i wygasa najpóźniej, gdy poprawiona wersja kończy 14 dni; potem bump.
- [2026-10-21] [W testach kontraktu każdy import ma nowe identyfikatory linii; test migracji odtwarza późniejsze migracje](lessons/2026-10-21-test-ids-and-migration-replay.md) — ponowny zapis tych samych `id` daje naruszenie klucza, które `translate()` pokazuje jako `duplicate_pairing`.
- [2026-10-21] [`schema:check` porównuje z plikiem snapshotu nazwanym od bazy, nie z introspekcją](lessons/2026-10-21-schema-check-snapshot-per-database.md) — snapshoty `.snapshot-<baza>.json` muszą mieć postać z encji (nie znormalizowaną przez Postgresa); sprawdzaj `schema:check` dla każdej nazwy bazy.

- [2026-10-19] [Axe w Vitest (jsdom) nie mierzy kontrastu: kontrast sprawdzaj z tokenów](lessons/2026-10-19-axe-in-jsdom-limits.md) — `color-contrast` wyłączony w jsdom jawnie; kontrast liczy `src/stories/contrast.ts` z `styles.css`; asercja niepustego markupu.
- [2026-10-19] [W świeżym worktree najpierw pełna `npm install`, potem `-w <pakiet> -D`](lessons/2026-10-19-full-install-before-adding-deps.md) — instalacja z `-w` zostawia `node_modules` bez narzędzi roota (np. `vitest`).
- [2026-10-18] [Element widoczny tylko z JavaScriptem: `useSyncExternalStore`, nie `setState` w `useEffect`](lessons/2026-10-18-script-only-ui-use-sync-external-store.md) — `useSyncExternalStore(noop, () => true, () => false)`: brak elementu w HTML i przy hydratacji, bez błędu oxlint `set-state-in-effect`.
- [2026-10-17] [E2E „bez JavaScriptu” w agent-browser: blokuj skrypty przed pierwszą stroną, klikaj przez `eval`](lessons/2026-10-17-e2e-without-javascript.md) — `route '**/*.js' --abort` przed pierwszym `open` (cache), bez `:has-text`; lokalnie systemowy Chrome + `embedded-postgres`; proxy bez JS ustawia `x-forwarded-host` (akt. 2026-10-19).
- [2026-10-17] [`headers()` w Next.js 16 ukrywa nagłówki routera — prefetch rozpoznawaj w proxy](lessons/2026-10-17-nextjs-headers-hide-router-prefetch.md) — `Next-Router-Prefetch`/`RSC` są niewidoczne w stronie; proxy ustawia własny nagłówek, `after()` wołaj ostatni przed `return`.
- [2026-10-16] [Bez Dockera uruchom PostgreSQL z `embedded-postgres` poza repozytorium](lessons/2026-10-16-postgres-without-docker.md) — `test:db`, `migration:create` i `schema:check` lokalnie; po migracji odśwież cztery snapshoty; równoległe agenty — własny katalog i port (akt. 2026-10-17); scratchpad bywa czyszczony — odtwórz serwer (akt. 2026-10-19); po pełnym wyczyszczeniu: świeża instalacja + ręczny `hydrate-symlinks.js` (akt. 2026-10-19).
- [2026-10-16] [Strony serwerowe testuj w Vitest przez `prerender`](lessons/2026-10-16-ssr-page-tests-with-prerender.md) — `react-dom/static` renderuje asynchroniczne strony z atrapami `next/headers`; zrzuty 390 px nie z Chrome headless (min. ~500 px).
- [2026-10-15] [Next.js 16 nadpisuje `Vary` stron App Routera](lessons/2026-10-15-nextjs-vary-header-overwritten.md) — `Vary` z proxy i `next.config` nie dochodzi do klienta; sprawdzaj nagłówki `curl -D -` na `next start`.
- [2026-10-15] [Dokument „do wdrożenia” może dotyczyć innego produktu](lessons/2026-10-15-adopting-a-foreign-standard.md) — sprawdź, czy dotyczy repozytorium, zapisz mapowanie reguł i odstępstwa, weryfikuj każdą regułę na kodzie.
- [2026-10-15] [Klucze od klienta nie trafiają do zwykłego obiektu jako słownika](lessons/2026-10-15-client-chosen-keys.md) — `constructor` i `__proto__` gubią się w `obj[k] ??= …`; używaj `Map` / `Object.fromEntries`.
- [2026-10-15] [Konfiguracja zawodzi zamykająco, ale budowanie nie może jej wymagać](lessons/2026-10-15-config-fails-closed-and-boot-without-env.md) — leniwy `env()`, `force-dynamic`, `instrumentation.ts`, `boot:check`.
- [2026-10-14] [Import plików: prawdziwe pliki, cały łańcuch, stan formularza, układ tabeli](lessons/2026-10-14-import-conventions.md) — `\b` a `ł`, puste komórki w XLSX, zmiana zamiast obecności pola, `min-w-0`, brak pliku vs pusty plik.
- [2026-10-14] [W Next.js nie używaj `instanceof` ani nazw klas do rozpoznawania błędów z `core`](lessons/2026-10-14-nextjs-duplicate-module-instanceof.md) — dwie kopie modułu w bundlach i zminifikowane nazwy; `domainError()` po literalnym `name` i `code`.
- [2026-10-14] [Uwierzytelnianie: jedna tabela uprawnień, sprawdzanie przy każdych drzwiach, test przez przeglądarkę](lessons/2026-10-14-auth-conventions.md) — layout, akcje i API sprawdzają same; sfałszowane formularze testuj natywnie z przeglądarki.
- [2026-10-14] [Po akcji serwerowej wołaj `revalidatePath(..., 'layout')`](lessons/2026-10-14-server-action-layout-revalidate.md) — liczniki w layoucie (kolejka, publikacja) są inaczej nieaktualne po przekierowaniu.
- [2026-10-14] [Zapisy: reguły w czystych funkcjach, atomowy commit, błędy domenowe, wspólny kontrakt](lessons/2026-10-14-write-path-conventions.md) — demotion przed promotion, async komendy, czas z zewnątrz, goście czytają migawkę.
- [2026-10-14] [`loading.tsx` strumieniuje stronę: `notFound()` i `redirect()` dają status 200](lessons/2026-10-14-nextjs-loading-streams-and-http-status.md) — strony ze szczegółami i przekierowaniami poza zasięgiem `loading.tsx`; listy w panelu wymagają JS.
- [2026-10-14] [Skopiowane komponenty shadcn sprawdzaj w wyrenderowanym HTML](lessons/2026-10-14-verify-shadcn-copies-in-html.md) — Progress miał `indeterminate` zamiast `aria-valuenow`; poprawki lokalne w `packages/ui/AGENTS.md`.
- [2026-10-14] [Przyklejone paski wymagają scroll-padding na html](lessons/2026-10-14-sticky-bars-scroll-padding.md) — `scroll-padding-top/bottom` równe wysokości pasków i `pointer-events-none` na tle paska.
- [2026-10-14] [Testy SSR: usuń `<!-- -->` z HTML i czekaj na nawigację](lessons/2026-10-14-ssr-html-assertions-and-test-races.md) — React rozdziela teksty komentarzami; po kliknięciu czekaj na żądanie POST / stan DOM (nie tylko URL), testuj z JS i bez JS; „brak liczb” sprawdzaj na tekście bez tagów, „bez JS” przez proxy usuwający `<script>` (akt. 2026-10-17).
- [2026-10-14] [Monorepo wymaga npm ≥ 11.6 — npm 10 nie instaluje Vitest 5](lessons/2026-10-14-npm-11-for-vitest-5.md) — błąd `edgesOut` = za stary npm; decyzje o skryptach instalacyjnych w `allowScripts`.
- [2026-10-14] [TypeScript 7 nie ma klasycznego API JS — narzędzia muszą używać CLI tsc](lessons/2026-10-14-typescript-7-toolchain.md) — `useTypeScriptCli` w Next.js, deklaracje importów CSS, sprawdzaj typecheck celowym błędem.
- [2026-10-14] [W poleceniach powłoki i skryptach npm pisz POSIX](lessons/2026-10-14-posix-shell-in-scripts.md) — `/bin/sh` to często `dash`: bez `{a,b}`, `${PIPESTATUS}`, `[[ ]]`.
- [2026-10-14] [Obok każdego AGENTS.md umieść CLAUDE.md z @AGENTS.md](lessons/2026-10-14-claude-code-nested-claude-md.md) — Claude Code wczytuje zagnieżdżone CLAUDE.md, nie AGENTS.md.
- [2026-10-14] [Do udostępnienia mockupów jako jednego pliku HTML użyj vite-plugin-singlefile](lessons/2026-10-14-single-file-build-for-sharing.md) — buduj na kopii repo, favicon jako data URI, bez manifestu, wtyczka tylko `--no-save`.
- [2026-10-14] [Po każdej zmianie reguł silnika przejrzyj pełną macierz dań × win](lessons/2026-10-14-engine-calibration-matrix.md) — `npm run engine:matrix`; testy nie wyłapią błędów kalibracji wynikających z interakcji reguł, każdą anomalię zamień w test; ranking pilnuje test złoty `engine-golden`, sprawdzony mutacją; nowe pola obok rankingu przypinaj osobno (akt. 2026-10-16).
- [2026-10-14] [Drafter importu: konstrukcje „X steak” przed mięsem](lessons/2026-10-14-import-drafter-keyword-order.md) — szczegółowe frazy w `PROTEIN_WORDS` muszą być przed ogólnymi słowami kluczowymi.
- [2026-10-14] [Dzieci siatki CSS muszą mieć min-width: 0](lessons/2026-10-14-css-grid-min-width.md) — używaj `minmax(0, 1fr)` i sprawdzaj `scrollWidth` przy 390 px.

## Nieaktualne

(brak)
