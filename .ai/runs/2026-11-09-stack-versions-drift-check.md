---
started: 2026-11-09 16:00
ended: 2026-11-09 16:40
agent: Claude Code / claude-opus-5-5 (pod-agent, worktree)
spec: brak — narzędzie procesu (rozszerzenie `check:context`), bez zmiany zachowania produktu
outcome: success
related: [.ai/runs/2026-11-09-agent-context-slimming.md]
---

# Strażnik rozjazdu wersji w `AGENTS.md` §1.1 (`check:context`)

## Zadanie
Wersje w tabeli `AGENTS.md` §1.1 rozjeżdżają się z `package.json` po każdym bumpie Dependabota (przed #142 nieaktualne były Next, React, MikroORM, Vitest). Dodać do `check:context` deterministyczne, offline porównanie tabeli z dokładnymi przypięciami w `package.json` workspace'ów oraz `engines` (npm, Node), jako OSTRZEŻENIE, i tryb `--fix-versions` (podgląd; `--write` zapisuje), który przepisuje w tabeli wyłącznie tokeny wersji. Testy najpierw. Gałąź `chore/stack-versions-drift-check`, commit lokalny, bez push i PR.

## Przebieg
- Gałąź z `origin/main` (37d64f9). Przeczytane: `AGENTS.md` §1.1, `scripts/check-context.mjs`, `packages/testkit/tests/check-context.test.ts`, `.ai/docs/commands.md`, nagłówek `.ai/lessons.md`, `package.json` root i pakietów.
- Testy najpierw (11 nowych w `check-context.test.ts`): parsowanie tabeli w kształcie z repo, brak ustaleń przy zgodności, rozjazd dokładnego przypięcia z poprawką jednego tokenu, `@mikro-orm/*` niezgodne między sobą / brak przypięcia (bez poprawki), zakresy ignorowane (`≥ 19`, PG, peer `^19`), `engines` z zachowaniem precyzji komórki, poprawka zmienia tylko tokeny (pozostałe linie identyczne, CRLF zachowane, idempotentna, odmowa przy niezgodnym tokenie), CLI: ostrzeżenie z kodem 0 i podpowiedzią, `--fix-versions` dry run / `--write` / drugi przebieg, kod 1 przy nienaprawialnym, kod 2 przy samym `--write`, test na repozytorium. Czerwone: moduł `scripts/lib/stack-versions.mjs` nie istniał.
- Implementacja: `scripts/lib/stack-versions.mjs` (+ `.d.mts`) — parser (kolumny po nagłówku „Wersja”/„Technologia”, segmenty `, ` / ` / ` / ` + `, etykieta z segmentu albo z kolumny technologii po pozycji, gdy liczby się zgadzają), mapa `KNOWN` (Next.js, React, TypeScript, MikroORM = wszystkie `@mikro-orm/*`, Awilix, Tailwind CSS, Vitest, npm/Node = `engines`), porównanie, poprawka po (linia, kolumna) z kontrolą tokenu. `check-context.mjs`: sekcja 9a (ostrzeżenie), linia raportu `stack versions checked: N`, tryb `--fix-versions [--write]` na surowym pliku (BOM/CRLF).
- Decyzja: OSTRZEŻENIE, nie błąd — PR Dependabota nie edytuje `AGENTS.md`, błąd czerwieniłby każdy bump; poprawka jednym poleceniem po scaleniu. `AGENTS.md` bez zmian (tabela parsowalna w obecnym kształcie).
- Sprawdzenie na kopii prawdziwych plików (`next` 16.5.0, `react` 19.4.0 w `app` i `ui`, `engines.node >=24.0.0`): 3 ostrzeżenia, dry run 3 zmiany, `--write` zmienił tylko linie 42 i 48 (`16.5.0, 19.4.0`, `Node ≥ 24.0`), drugi przebieg „nothing to change”.

## Weryfikacja
- `npx -y npm@11.20.0 ci`: OK.
- `npx vitest run tests/check-context.test.ts` (testkit): przed implementacją czerwone (brak modułu), po: 41 passed.
- `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm test`: exit 0 (745 + 126 + 62 + 500 + 498).
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (tylko rozmiary specyfikacji `2026-11-04-*`, jak przed zmianą); `stack versions checked: 9`, brak ostrzeżenia §1.1 — tabela zgodna z `package.json`. `--fix-versions`: „nothing to change”, exit 0.
- `npm run check:qa`: 105 scenariuszy OK. `npm run check:routes`: OK. `npm run secrets:scan`: tylko wpisy z allowlisty.
- Nie uruchomiono: `npm run build` (zmiana tylko w skryptach narzędziowych i testach, nie w kodzie aplikacji), CI.

## Wynik
Strażnik działa offline i deterministycznie; rozjazd = ostrzeżenie z gotowym poleceniem naprawy. Ograniczenia: `packageManager` (`npm@11.20.0`) nie jest porównywany (tabela podaje minimum `engines`); nowa technologia w tabeli wymaga wpisu w `KNOWN` (do tego czasu ostrzeżenie „not checked”). Ryzyko: risk-medium (`scripts/` pod CODEOWNERS); tylko commit lokalny, bez push i PR.

### Poprawki po review PR #145 (changes needed)
1. MAJOR: usunięty test rozjazdu na prawdziwym repozytorium (bump Dependabota by go czerwienił). Na repozytorium zostało tylko sprawdzenie parsera: `stack versions checked: N` z N ≥ 9, `skipped` puste, brak dokładnych wersji bez mapowania i zakresów pakietów (bez czytania wersji z `package.json`). Cały rozjazd testowany na drzewach syntetycznych.
2. `check-context.mjs`: zamiast `existsSync`/`statSync` przed użyciem — `readFileSync`/`readdirSync`/`statSync` w `try/catch` (`orNull`: `null` przy ENOENT/ENOTDIR/EISDIR, inne błędy rzucane dalej), w `read`, `listDir`, trybie `--fix-versions`, ścieżkach routingu, linkach lekcji, specyfikacjach, skillach, 9a. `existsSync` nie jest już importowany.
3. Komórka, której nie da się porównać, daje ostrzeżenie `§1.1: cell for X not checked: <powód> (line N)`: `~7.0.2`, `^7.0.2`, `7.0.x`; pakiet zapisany jako zakres; więcej gołych wersji niż nazw technologii (raz na komórkę); nieznana technologia z dokładną wersją; npm/Node bez `≥`. Cicho pomijane tylko zakres nie-pakietu (`PG ≥ 16`) i token niebędący wersją (`new-york-v4`). Testy syntetyczne dla każdego przypadku i ostrzeżenie w CLI; prawdziwa tabela: 0 takich ostrzeżeń.
4. Nagłówek skryptu i `commands.md`: `--write` pisze do `<root>/AGENTS.md` i podąża za dowiązaniem symbolicznym.

Weryfikacja po poprawkach: testkit `check-context.test.ts` 44 passed; pełna lista w odpowiedzi koordynatorowi (lint, typecheck, `npm test`, `check:context` 0 błędów / 9 ostrzeżeń bez §1.1, `check:qa`, `check:routes`, `secrets:scan`).

## Lekcje
Brak nowej lekcji (budżet indeksu ciasny; decyzje opisane w `commands.md` i komentarzu skryptu).
