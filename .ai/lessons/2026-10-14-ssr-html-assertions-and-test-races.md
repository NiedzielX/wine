---
date: 2026-10-14
updated: 2026-10-17
area: tooling
status: active
source: .ai/runs/2026-10-14-guest-app-parity.md
---

# Testy stron renderowanych serwerowo: usuń `<!-- -->` z HTML i czekaj na nawigację

## Kontekst
Smoke test szukał w HTML tekstów jak „Glass 64 zł” i „List no. 112” i ich nie znajdował, mimo że strona była poprawna. W testach w przeglądarce wyniki „po kliknięciu” bywały stare (poprzedni URL, link „Back” poprzedniej strony), a `page.evaluate` w trakcie przeładowania kończył się błędem.

## Przyczyna
- React rozdziela sąsiednie węzły tekstowe znacznikami `<!-- -->`, więc „Glass {price} zł” trafia do HTML jako `Glass <!-- -->64<!-- --> zł`.
- Kliknięcie linku w Next.js (z JS: nawigacja kliencka, bez JS: pełne przeładowanie) kończy się asynchronicznie; odczyt tuż po `click()` widzi starą stronę.

## Reguła
- Asercje na HTML: najpierw `text.replace(/<!-- -->/g, '')` (`scripts/smoke.mjs` już to robi).
- Po kliknięciu czekaj na skutek: `wait_for_url(...)` lub `wait_for_selector(...)`, dopiero potem czytaj stan. Nie używaj stałych `sleep` jako jedynej synchronizacji.
- Przy zmianie zachowania zawsze sprawdź obie ścieżki: z JavaScriptem i bez (`java_script_enabled=False`) — strony gościa mają działać w obu.
- Gdy zmiana kończy się przekierowaniem na **ten sam adres** (np. `?saved=approved` dwa razy z rzędu), `wait_for_url` wraca natychmiast. Synchronizuj się na faktycznym zakończeniu żądania (każda zmiana to jeden POST akcji serwerowej: zlicz odpowiedzi `POST` strony i dopiero potem czekaj na URL i `networkidle`) albo na oczekiwanym stanie DOM (liczba elementów), nie na sleep.
- „Na ekranie nie ma liczby” (np. `showScores = false`) sprawdzaj na **tekście**, nie na surowym HTML: `/\d+%/` trafia w `style="width:83%"` pasków i w zakodowane adresy (`%2C` w `?dishes=a%2Cb`). Najpierw `html.replace(/<[^>]*>/g, ' ')`, potem asercja (2026-10-17, E08 F3).
- Wygląd „bez JS” w panelu przeglądarki: mały proxy (Node `http`, ~15 linii, w scratchpadzie) przed `next start`, który usuwa `<script>…</script>` z odpowiedzi HTML i przepuszcza resztę; w przeglądarce `document.scripts.length === 0`, emulacja 390 px działa (Chrome headless nie zejdzie poniżej ~500 px) (2026-10-17).
- Najpierw zakładaj błąd w teście, ale go **udowodnij** osobnym, deterministycznym skryptem, zanim uznasz aplikację za poprawną.

## Jak sprawdzić
`npm run smoke` przechodzi w obu trybach danych; skrypt przeglądarkowy czeka na URL przed odczytem.
