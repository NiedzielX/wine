---
started: 2026-11-18
ended: 2026-11-18
agent: Claude Code
spec: brak — porządkowanie dokumentacji, bez zmiany zachowania aplikacji
outcome: success
related: [.ai/runs/2026-11-17-neutralize-process-docs.md, .ai/runs/2026-10-15-engineering-standards.md]
---

# Usunięcie dokumentu standardów innego produktu i odwołań do niego

## Zadanie
Zlecenie właściciela: repozytorium będzie przeglądane w całości przez osoby z zewnątrz i ma wyglądać na samodzielny projekt. Przeniesiony dokument standardów inżynieryjnych napisany dla innego produktu zostaje usunięty, a standardy są przedstawione jako standardy Wine Match. Praca ułożona na gałęzi `docs/neutralize-process-docs` (PR #171); po jego scaleniu gałąź przebazuje się na `main`.

## Przebieg
1. Inwentarz odwołań (`git grep` po nazwie produktu i ścieżce katalogu `reference/`): `.ai/docs/engineering-standards.md`, `.ai/docs/architecture-rules.md`, specyfikacja i log z 2026-10-15, lekcja `adopting-a-foreign-standard`, wzmianka w `2026-11-15-knowledge-maintenance`, log `2026-11-17-neutralize-process-docs` (cudzy log, nieedytowany).
2. Pomiar przed zmianą (`check:context`, `check:qa`, `secrets:scan`, `audit:process`).
3. Usunięty plik standardów innego produktu (`git rm`), katalog `.ai/docs/reference/` zniknął razem z nim; nic innego w nim nie leżało.
4. `.ai/docs/engineering-standards.md`: sekcja „Skąd ten dokument” zastąpiona zasadą nadrzędną, tabela „standard z oryginału” przekształcona w „reguła → ustalenie → gdzie egzekwowana” (wiersze porównawcze przeformułowane na ustalenia projektu; reguły, progi i przykłady bez zmian). Pasujące zdania w `architecture-rules.md` i `AGENTS.md` §1.6.
5. Specyfikacja i log z 2026-10-15: neutralne tytuły i zdania, poprawione `related:`, usunięty wiersz o poprawce w cudzym dokumencie zakresu. Lekcja przemianowana (`git mv`) na `adopting-an-external-standard`, treść i indeks `.ai/lessons.md` poprawione.
6. Skrypty i testy (`scripts/*`, `packages/testkit/tests/*`, kontrole `check:context`) nie wskazywały usuwanego pliku ani starego sluga lekcji.

## Weryfikacja
- Przed i po te same liczby: `check:context` 0 błędów / 12 ostrzeżeń; `check:qa` 128 scenariuszy OK; `secrets:scan` 22 trafienia, wszystkie na allowliście (16 wpisów); `audit:process` PASS 46, FAIL 4, PARTIAL 3, MANUAL 10 (cztery FAIL dotyczą sprawdzeń GitHub niedostępnych z tego środowiska, bez związku ze zmianą).
- `npm run lint` i `npm run typecheck`: kod wyjścia 0. `npm test`: testkit 675 przeszło (1 pominięty), core 793 przeszło.
- `git grep` po nazwie produktu i po ścieżce usuniętego pliku: brak trafień.

## Wynik
Dokument standardów innego produktu usunięty; standardy opisane jako własne. Do decyzji właściciela: czy dopisać w logu z 2026-11-17 neutralne sformułowanie (łamie zasadę niezmienności logów, więc tylko na wyraźne polecenie).

## Lekcje
Brak nowych.
