---
status: draft
created: 2026-11-09
owner: właściciel (Filip)
related: [.ai/docs/review-protocol.md, .ai/runs/2026-11-09-lesson-21-multi-model-review.md, .ai/lessons/2026-11-09-reviewers-from-different-model-families.md]
superseded_by:
author_model: claude-opus-5-5
reviewed_by: not recorded
---

# Opcjonalny harness review wielorodzinnego (lekcja 21)

**Draft. Nie implementować bez zmiany statusu na `approved` przez właściciela (`AGENTS.md` §3).**

## Problem
`review-protocol.md` §9 wymaga recenzentów z co najmniej dwóch rodzin modeli, identycznego wejścia, triage każdej uwagi i limitu 3 rund. Dziś wszystkie recenzje robią pod-agenci Claude, a kroki (zbudowanie wejścia, rozesłanie, czy przyszły wszystkie odpowiedzi, walidacja, numer rundy) wykonuje z pamięci agent główny, który potrafi o kroku zapomnieć. Jest już kontrakt (`.ai/schemas/review-*.schema.json`) i walidator (`npm run review:validate`), brak programu, który ich używa.

## Cel i zakres
Skrypt `npm run review:fanout`, który rozsyła jeden plik wejścia do skonfigurowanych recenzentów (różne rodziny), zbiera i waliduje odpowiedzi, scala uwagi w jedną listę do triage i pilnuje limitu rund; tryb nocny bez nadzoru.

**Poza zakresem:** automatyczny triage (klasyfikację każdej uwagi robi orkiestrator lub człowiek, `review-checklists.md` „triage”); automatyczne poprawki; komentowanie PR-ów i etykiety (nocna rutyna, `nightly-review-routine.md`); router wybierający model automatycznie (§9: ręczne presety).

## Wymagania
- R1 Wejście: jeden plik zgodny z `review-input.schema.json`; skrypt odmawia przed wysyłką, gdy walidacja nie przechodzi albo `round` > 3.
- R2 Konfiguracja recenzentów w pliku w repo (`.ai/review-presets.json`): rola → rodzina, model, polecenie CLI lub nazwa adaptera API, prompt per rodzina, limit czasu, limit kosztu. **Bez kluczy**: konfiguracja podaje tylko nazwę zmiennej środowiskowej z kluczem.
- R3 Każdy recenzent dostaje bajtowo ten sam plik wejścia; równolegle; brak wymiany danych między recenzentami.
- R4 Odpowiedź każdego recenzenta przechodzi `review:validate` z tym wejściem; odpowiedź niepoprawna jest zapisana jako niepoprawna (bez naprawiania), a brak odpowiedzi w limicie czasu jako `timeout`. Wynik przebiegu mówi, ile odpowiedzi przyszło, ile poprawnych i z ilu rodzin.
- R5 Scalanie: jedna lista uwag z odnośnikiem do każdego źródła (recenzent, rodzina, id); uwagi o tym samym `location` grupowane obok siebie, ale **nigdy usuwane ani ważone liczbą zgłoszeń**.
- R6 Dziennik faz (wejście zwalidowane, wysłane, odpowiedź N, timeout, scalone) w pliku JSON Lines obok wyników; deterministyczny format, bez treści kluczy i zmiennych środowiska.
- R7 Tryb nocny: bez interakcji, twardy limit kosztu i czasu na przebieg; po przekroczeniu kończy z wynikiem częściowym i jasnym statusem.
- R8 Bez sieci w testach: adaptery wstrzykiwane, testy na fałszywych recenzentach.

## Kryteria akceptacji
- [ ] AC1 Wejście z `round: 4` albo z polem spoza schematu kończy się kodem 1 przed jakimkolwiek wywołaniem recenzenta (test z fałszywym adapterem liczącym wywołania).
- [ ] AC2 Dwóch fałszywych recenzentów dostaje identyczne bajty (test porównuje SHA-256).
- [ ] AC3 Recenzent, który nie odpowie w limicie, daje `timeout` w wyniku, a przebieg kończy się wynikiem częściowym (test z zegarem wstrzykniętym).
- [ ] AC4 Uwaga zgłoszona przez jednego z trzech recenzentów jest w scalonej liście (test).
- [ ] AC5 Ani konfiguracja, ani dziennik, ani wynik nie zawierają wartości klucza (test z kluczem testowym w środowisku; `npm run secrets:scan` czysty).
- [ ] AC6 Polecenie opisane w `.ai/docs/commands.md`; `review-protocol.md` §9 aktualizuje wiersz „Orkiestracja w kodzie”.

## Projekt rozwiązania
- `scripts/review-fanout.mjs` (CLI) + `scripts/lib/review-fanout.mjs` (czysta logika: kolejka, limit czasu, scalanie), adaptery: `cli` (uruchamia polecenie z plikiem wejścia jako argumentem, czyta JSON ze stdout), `claude-subagent` (instrukcja dla agenta głównego, bez API). Adaptery API innych dostawców tylko po decyzji z pytań niżej.
- Reużywa `validate` i `checkFiles` z `scripts/review-validate.mjs`.
- Testy: `packages/testkit/tests/review-fanout.test.ts`.
- Konwersja paczki `review:pack` (Markdown) do JSON wejścia: osobny krok `review:pack --json` albo w harnessie (pytanie 5).

## Ryzyka i otwarte pytania
1. **Którzy dostawcy i modele** jako druga (i trzecia) rodzina? Przez CLI (np. narzędzie dostawcy zainstalowane lokalnie) czy przez API?
2. **Gdzie żyją klucze?** Propozycja: pęk kluczy systemu albo środowisko powłoki właściciela, nigdy w repo ani w sesji agenta (`AGENTS.md` §9: agent nie czyta `.env`). Czy harness ma działać tylko z terminala właściciela, a nie z sesji agenta?
3. **Limit kosztu** na przebieg i na noc (kwota albo tokeny)? Co przy przekroczeniu: przerwać czy dokończyć bieżącą rundę?
4. **Dane wysyłane na zewnątrz:** diff i spec idą do zewnętrznego dostawcy. Czy są obszary repo, które nie mogą wyjść (np. dane demo restauracji, umowy)? Czy wystarczy `secrets:scan` przed wysyłką?
5. **Format wejścia:** czy `review:pack` ma dostać tryb `--json`, czy harness sam buduje JSON?
6. **Trzy wymagane nogi bezpieczeństwa** (`AGENTS.md` §9): harness ma wyjście na zewnątrz i kontakt z niezaufaną treścią (diff), więc nie może mieć dostępu do danych prywatnych; czy uruchamiamy go w osobnym, czystym checkoucie `main`?
7. **Kiedy go używać:** tylko `risk-high` i duże moduły (§9), czy też jako druga opinia dla `risk-medium` w nocy, gdy koszt jest niski?
8. Czy w tym repo wystarczy na razie ręczny przepływ (zewnętrzny recenzent + `review:validate`), a harness poczekać, aż pełny przepływ zostanie użyty kilka razy?

## Changelog
- 2026-11-09 — Autor/recenzent: claude-opus-5-5 / not recorded (draft bez niezależnego przeglądu; źródło: `.ai/runs/2026-11-09-lesson-21-multi-model-review.md`).

## Realizacja
(Brak: draft.)
