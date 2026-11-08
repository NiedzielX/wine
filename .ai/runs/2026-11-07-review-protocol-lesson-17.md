---
started: 2026-11-07 13:10
ended: 2026-11-07 13:50
agent: Claude Code (pod-agent w worktree, na zlecenie sesji nadrzędnej)
spec: brak — zadanie procesowe zlecone przez koordynatora (lekcja 17), bez zmiany zachowania produktu
related: [.ai/docs/fix-verification.md, .ai/docs/parallel-work.md]
outcome: success
---

# Część procesowa lekcji 17: protokół review, paczka recenzenta, listy kontrolne, etykiety, rutyna nocna

## Zadanie
Zapisać protokół review (trzy warstwy bramek, triage kolejki, ochrona gałęzi), zaimplementować `npm run review:pack` (bez opisu PR w wyniku), listy kontrolne, tabelę etykiet i opis, co powinna mówić rutyna nocna. Bez push, bez PR, bez zapisów w GitHubie.

## Przebieg
- Przeczytano AGENTS.md, parallel-work, fix-verification, commands, SDLC (etykiety, ryzyko), CODE_REVIEW, security-notes.
- Odczyty tylko GET: ochrona gałęzi `main` i lista etykiet (wszystkie etykiety z SDLC już istnieją, `ready-for-owner` = `merge-queue`).
- Początkowo „reguła trzech sprawdzeń” §10 nie istniała w repo (plik kończył się na §9), więc lista authz była rekonstrukcją. Po scaleniu #127 (`origin/main`, czyste scalenie) przejście authz odwzorowuje `engineering-standards.md` §10, a protokół i etykiety wskazują `parallel-work.md` §1.11 (aktualizacja `docs/security/threat-model.md` przy `risk-high`). Sekcja etykiet pozostaje §8 (brak kolizji; istniejące zdublowane §6/§7 pochodzą z `main`, nie ruszane).
- Wskaźnik w tabeli routingu `AGENTS.md` (wiersz „review”), bo plik da się edytować bez błędu `check:context` (jest już ponad progiem ostrzeżenia, +45 B).
- Logika paczki w `scripts/lib/review-pack.mjs` (wstrzykiwany fetcher), cienki CLI w `scripts/review-pack.mjs`; test w `packages/testkit/tests/review-pack.test.ts`.
- Próba na prawdziwym PR #125 (tylko GET): paczka zbudowana, bez opisu.
- Lokalnie domyślny `npm` to 10.9 (nie instaluje Vitest 5): użyto `/opt/homebrew/bin/npm` 11.20.

## Weryfikacja
- `review-pack.test.ts`: 10 testów zielonych (po jednej poprawce samego testu: zbyt luźny regex wykrywał `/commits/<sha>/check-runs` jako endpoint komunikatów; zastąpiony listą dozwolonych ścieżek).
- `npm run check:context`: 0 błędów, te same 11 ostrzeżeń co przed zmianą; `check:qa`: 83 scenariusze OK; `lint`, `typecheck`, `secrets:scan` czyste; `npm test`: wszystkie pakiety zielone; `npm run build`: OK.
- `node scripts/review-pack.mjs 125` na prawdziwym PR (GET): paczka zbudowana, bez tytułu i opisu.
- Nie uruchomiono: `test:db`, `test:e2e` (zmiana nie dotyka bazy ani UI).

## Wynik
Protokół, listy kontrolne, tabela etykiet, opis rutyny nocnej i paczka recenzenta gotowe. Rutyny w chmurze nie zmieniano. Do decyzji właściciela: elementy z `review-protocol.md` §7 (CodeQL jako wymagany check, 2FA, alerty Dependabot).

## Poprawki po review PR #129 (2026-11-08)
Scalono `origin/main` (#126, bez konfliktów). Review bezpieczeństwa wejścia: specyfikacje tylko z bazy, ostrzeżenie „dane nieufne” przed i po diffie, nazwy plików w bloku kodu i oczyszczone, `fenceFor` bez `Math.max(...)`, lista dozwolonych znaków w nazwach checków, walidacja CLI (`--max-diff-bytes`, `--repo`, `--out` bez nadpisania, `--force`), ucięcie na granicy znaku z listą plików poza cięciem; 11 nowych testów było czerwonych przed zmianą kodu. Review spójności procesu: zrzeczenie właściciela, zakres `merge-queue`, rutyna tylko komentarze, filtr kolejki, nagłówek `## 5` w `parallel-work.md`, odwołanie do `AGENTS.md` §6.1.

## Lekcje
`.ai/lessons/2026-11-07-review-pack-not-author-story.md`
