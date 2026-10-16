# Lekcje projektu Wine Match

Indeks pamięci długoterminowej agentów AI i zespołu. Zasady prowadzenia: `AGENTS.md`, sekcja 5.

**Każdy agent czyta ten plik na początku sesji.** Pełna treść lekcji: `.ai/lessons/`.

Format linii (najnowsze na górze):
`- [YYYY-MM-DD] [Tytuł jako reguła](lessons/YYYY-MM-DD-slug.md) — reguła w jednym zdaniu`

## Aktywne

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
- [2026-10-14] [Testy SSR: usuń `<!-- -->` z HTML i czekaj na nawigację](lessons/2026-10-14-ssr-html-assertions-and-test-races.md) — React rozdziela teksty komentarzami; po kliknięciu czekaj na żądanie POST / stan DOM (nie tylko URL), testuj z JS i bez JS.
- [2026-10-14] [Monorepo wymaga npm ≥ 11.6 — npm 10 nie instaluje Vitest 5](lessons/2026-10-14-npm-11-for-vitest-5.md) — błąd `edgesOut` = za stary npm; decyzje o skryptach instalacyjnych w `allowScripts`.
- [2026-10-14] [TypeScript 7 nie ma klasycznego API JS — narzędzia muszą używać CLI tsc](lessons/2026-10-14-typescript-7-toolchain.md) — `useTypeScriptCli` w Next.js, deklaracje importów CSS, sprawdzaj typecheck celowym błędem.
- [2026-10-14] [W poleceniach powłoki i skryptach npm pisz POSIX](lessons/2026-10-14-posix-shell-in-scripts.md) — `/bin/sh` to często `dash`: bez `{a,b}`, `${PIPESTATUS}`, `[[ ]]`.
- [2026-10-14] [Obok każdego AGENTS.md umieść CLAUDE.md z @AGENTS.md](lessons/2026-10-14-claude-code-nested-claude-md.md) — Claude Code wczytuje zagnieżdżone CLAUDE.md, nie AGENTS.md.
- [2026-10-14] [Do udostępnienia mockupów jako jednego pliku HTML użyj vite-plugin-singlefile](lessons/2026-10-14-single-file-build-for-sharing.md) — buduj na kopii repo, favicon jako data URI, bez manifestu, wtyczka tylko `--no-save`.
- [2026-10-14] [Po każdej zmianie reguł silnika przejrzyj pełną macierz dań × win](lessons/2026-10-14-engine-calibration-matrix.md) — `npm run engine:matrix`; testy nie wyłapią błędów kalibracji wynikających z interakcji reguł, każdą anomalię zamień w test; ranking pilnuje test złoty `engine-golden`, sprawdzony mutacją (akt. 2026-10-16).
- [2026-10-14] [Drafter importu: konstrukcje „X steak” przed mięsem](lessons/2026-10-14-import-drafter-keyword-order.md) — szczegółowe frazy w `PROTEIN_WORDS` muszą być przed ogólnymi słowami kluczowymi.
- [2026-10-14] [Dzieci siatki CSS muszą mieć min-width: 0](lessons/2026-10-14-css-grid-min-width.md) — używaj `minmax(0, 1fr)` i sprawdzaj `scrollWidth` przy 390 px.

## Nieaktualne

(brak)
