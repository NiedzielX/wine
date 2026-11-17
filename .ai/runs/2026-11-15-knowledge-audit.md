---
started: 2026-11-15 12:20
ended: 2026-11-15 13:10
agent: Claude Code (podagent audytu)
spec: brak — audyt tylko do odczytu plus dwa drafty specyfikacji (status draft, bez implementacji)
outcome: success
related: [.ai/runs/2026-11-10-process-playbook-audit.md, .ai/specs/2026-11-15-knowledge-maintenance.md, .ai/specs/2026-11-15-weekly-maintenance-routine.md]
---

# Jednorazowy audyt wiedzy w repozytorium i dwa drafty specyfikacji

## Zadanie
Część 1: raport `.ai/maintenance/2026-11-15-audit.md` (statusy specyfikacji, sprzeczności, martwe odwołania, lekcje, liczby, rekomendacje), bez poprawiania i przenoszenia czegokolwiek. Część 2: drafty `2026-11-15-knowledge-maintenance.md` (A) i `2026-11-15-weekly-maintenance-routine.md` (B). Bez pushu, PR-a i merge.

## Przebieg
- Worktree `/home/user/wine-audit` z `origin/main` (dc5068a), gałąź `docs/knowledge-audit`.
- Przeczytano AGENTS.md, lessons.md, process-templates, process-playbook, parallel-work, nightly-review-routine, PROCESS.
- Pod-agentów nie użyto: w tej sesji brak narzędzia do ich uruchamiania. Audyt wykonano bezpośrednio, każde ustalenie sprawdzone poleceniem (grep, ls, git log, skrypt `dead.mjs` w katalogu roboczym sesji, nie w repozytorium).
- Przegląd draftów: patrz sekcja „Changelog” w obu specyfikacjach (niezależnego agenta nie dało się uruchomić; wykonano przegląd własny w osobnym przebiegu i zapisano ograniczenie).
- Nie zmieniono kodu produktu, istniejących specyfikacji ani cudzych logów.

## Weryfikacja
- `npx -y npm@11.20.0 install --engine-strict=false`: zakończone (359 pakietów w `node_modules`; `npm audit` zgłasza podatności, bez zmian w repozytorium).
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (CTX-08, te same co przed zmianą; nowe pliki nie dodały ostrzeżeń).
- `npm run audit:process`: PASS 46, FAIL 6, PARTIAL 1, MANUAL 10 (bez zmiany względem `main`).
- `npm run lint`: bez błędów (`oxlint --deny-warnings`).
- `npm run secrets:scan`: 21 trafień, wszystkie na allowliście (16 wpisów), brak nowych.
- Nie uruchamiano `typecheck`, `test`, `build`: zmieniono wyłącznie pliki Markdown w `.ai/`, kod i skrypty bez zmian.
- Nazwy nowych plików w `.ai/` (`2026-11-15-*.md`) zgodne z `YYYY-MM-DD-slug.md`.

## Wynik
Raport (`.ai/maintenance/2026-11-15-audit.md`) i dwa drafty gotowe do przeglądu przez właściciela; push i PR robi agent nadrzędny.

## Lekcje
brak (nie powstała nowa nieoczywista reguła; kandydaci opisani w raporcie, sekcja D).

## Poprawki po przeglądzie niezależnym (ta sama seria, 2026-11-15)
- Niezależny agent (model nieznany) przejrzał oba drafty; właściciel przyjął rekomendacje z góry w czacie 2026-11-15. `status:` obu specyfikacji zostaje `draft`; `reviewed_by: not recorded (independent agent, model unknown)` (szablon w `.ai/docs/process-templates.md`).
- Każdą decyzję sprawdzono w kodzie: `scripts/process-audit.mjs` PROC-03 (pokrywa położenie specyfikacji, więc dawne R10 usunięto ze spec A); `scripts/check-context.mjs` sekcja 9 (nie obejmuje `.ai/skills`, więc dopisano do zakresu A); `.claude/settings.json` (`permissions.ask` dla zapisów `gh api`); `.ai/docs/parallel-work.md` §1 pkt 1 (typ M poza limitem WIP); `.github/CODEOWNERS` (brak `.ai/maintenance/` i `.ai/skills/`); `docs/PROCESS.md` (tabela lekcji kończy się na 22).
- Spec A: usunięto ostrzeżenie o położeniu specyfikacji, dodano `allowed-tools`, parametr zakresu, limit pod-agentów, gramatykę id, rozdzielone AC pilotażu, AC dla hooka i `process-audit`, podział na PR A(a) i A(b). Spec B: dwa kroki (audyt do odczytu, skrypt publikacji), przydział id przez skrypt, allowlista, faza 0 (próba w chmurze), UTC, kontynuacja po 30 commitach, wyłączenie po dwóch słabych przebiegach, realistyczny szacunek F1.
- Raport bazowy: tylko normalizacja formatu (wiersz `C-01..09` rozbity na dziewięć wierszy, id usunięte z niepierwszych komórek, odwołania do nieistniejącego `S-12` zamienione na „tabela A2”); treść ustaleń bez zmian.
- Nie ustalono: stan PR #150, możliwość rozdzielenia kroków w rutynie w chmurze, czy komendy z `.claude/commands/` działają w rutynie.
- Weryfikacja: patrz wyniki poniżej.
- `check:context` (npm 11.20.0, `--engine-strict=false`): 0 błędów, 9 ostrzeżeń (CTX-08, bez zmiany). `npm run lint`: bez błędów. `npm run secrets:scan`: 21 trafień, wszystkie na allowliście. `npm run audit:process`: PASS 46, FAIL 6, PARTIAL 1, MANUAL 10 (bez zmiany). Zmieniono wyłącznie pliki Markdown w `.ai/`.
