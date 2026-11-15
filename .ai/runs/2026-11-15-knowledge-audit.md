---
started: 2026-11-15 12:20
ended: 2026-11-15 13:10
agent: Claude Code (podagent audytu, lekcja 25)
spec: brak — audyt tylko do odczytu plus dwa drafty specyfikacji (status draft, bez implementacji)
outcome: success
related: [.ai/runs/2026-11-10-course-synthesis-audit.md, .ai/specs/2026-11-15-knowledge-maintenance.md, .ai/specs/2026-11-15-weekly-maintenance-routine.md]
---

# Jednorazowy audyt wiedzy w repozytorium i dwa drafty specyfikacji (lekcja 25)

## Zadanie
Część 1: raport `.ai/maintenance/2026-11-15-audit.md` (statusy specyfikacji, sprzeczności, martwe odwołania, lekcje, liczby, rekomendacje), bez poprawiania i przenoszenia czegokolwiek. Część 2: drafty `2026-11-15-knowledge-maintenance.md` (A) i `2026-11-15-weekly-maintenance-routine.md` (B). Bez pushu, PR-a i merge.

## Przebieg
- Worktree `/home/user/wine-audit` z `origin/main` (dc5068a), gałąź `docs/knowledge-audit`.
- Przeczytano AGENTS.md, lessons.md, process-templates, process-playbook, parallel-work, nightly-review-routine, PROCES_I_KURS oraz opracowanie lekcji 25 (dane; w materiałach nie znaleziono instrukcji wykraczających poza zadanie).
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
