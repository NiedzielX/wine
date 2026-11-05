# Praca równoległa agentów: zasady i klasyfikacja zadań

Źródło: lekcja 13 kursu (zadania równoległe i automatyzacja). Lekcja pokazuje, że więcej agentów nie skraca drogi do wydania: wąskim gardłem jest uwaga człowieka (review, QA, integracja), a nie pisanie kodu (prawo Amdahla). Ten plik zamienia to w zasady dla tego repozytorium i klasyfikuje zadania z planu `.ai/specs/2026-11-04-product-completion-plan.md`. Zasady skrótem są w `AGENTS.md` §8.

## 1. Zasady

1. **Limit pracy w toku (WIP): najwyżej 3 otwarte PR-y czekające na review właściciela** (nie liczą się PR-y typu M). Czwarte zadanie implementacyjne rusza dopiero, gdy któryś PR jest scalony albo zamknięty. Powód z badań: powyżej około trzech równoległych sesji rosną zmęczenie, błędy i przegapione zakończenia zadań.
2. **Jedna rzecz w skupieniu.** Zadanie interaktywne (typ I) agent robi z właścicielem, a nie w tle. W tym czasie w tle idą tylko zadania typu M.
3. **Typ decyduje o równoległości** (tabela w §2). Zadania typu S (ten sam model danych, migracja, wspólny kontrakt) idą po kolei, nawet gdy specyfikacja jest gotowa. Typu P: najwyżej 2–3 naraz, każde w osobnym worktree i w osobnych modułach.
4. **Zadania typu M (maintenance, research, automatyczny review) mogą iść szerzej**, bo nie wymagają uwagi przy pisaniu. Ich PR-y przechodzą przez review jak każde inne, ale odbieramy je partiami (punkt 6).
5. **Nadzór wyjątkami.** Agent najpierw próbuje sam (wg skilli `om-auto-*`). Zatrzymuje się tylko na decyzji należącej do człowieka (zakres, zachowanie produktu, zgoda na merge, zewnętrzne decyzje). Nie zatrzymuje się po każdym kroku, żeby ktoś kliknął „dalej”.
6. **Pytania do właściciela idą partiami**, w jednym miejscu (podsumowanie na końcu przebiegu), a nie pojedynczo w trakcie. Review otwartych PR-ów w stałym bloku czasu, nie w ciągłym przełączaniu.
7. **Izolacja:** jedna specyfikacja i jedna faza = jeden worktree = jeden PR (`AGENTS.md` §8). Agenci nie dzielą katalogu roboczego. Konflikty rozwiązujemy przy scalaniu, a safety net to testy (lekcje 12 i 13: izolacja w worktree plus scalanie z testami daje najlepszy wynik).
8. **Nie więcej agentów niż pracy.** Narzut komunikacji rośnie szybciej niż liczba agentów, więc dzielimy zadanie tylko tak, jak wymaga tego jego struktura.
9. **Miara postępu:** zamknięte PR-y, które przeszły bramkę QA (`SDLC.md`), i czas od zlecenia do merge. Nie liczba agentów, tokenów ani PR-ów.
10. **Przy kodzie o dużym znaczeniu** (silnik, uprawnienia, pieniądze) wolno wygenerować 2–3 warianty i wybrać najlepszy; do review idzie tylko wybrany.

## 2. Typy zadań

| Typ | Znaczenie | Ile naraz | Kto uczestniczy |
|---|---|---|---|
| **I** | interaktywne: decyzje architektoniczne, niejasne wymagania, projekt, ocena sommeliera | 1 (z właścicielem) | właściciel przez cały czas |
| **S** | sekwencyjne: ten sam model danych, migracja, wspólny kontrakt, kolejność scalania | 1 w danym obszarze | review po każdej fazie |
| **P** | równoległe w osobnych modułach, z dobrą specyfikacją | 2–3 | review po zakończeniu |
| **M** | masowe: research, zależności, flaky testy, lint, automatyczny review, triage | dowolnie, odbiór partiami | skan wyniku |

## 3. Klasyfikacja zadań z planu

Klasyfikacja jest wiążąca dla kolejności prac. Zmienia ją tylko zmiana tego pliku w PR. Zależności i ryzyka pochodzą z tabeli epików w planie.

| Zadanie | Typ | Dlaczego | Warunek startu |
|---|---|---|---|
| E11 wdrożenie produkcyjne (`approved`) | I → S | decyzje o hostingu i dostępach; potem kroki jeden po drugim | właściciel podejmuje decyzje o środowisku |
| E11b domknięcie kodów rekomendacji | S | zmienia kontrakt kodu, na którym stoją E17, E18, E20 | brak |
| E12 konta, PIN kelnera, role (F1–F6) | S | model danych i tabela uprawnień, od której zależą E13, E14, E15, E20 | brak; scalanie faza po fazie |
| E14 administrator systemu, organizacje | S | po E12 F1–F2, własny model organizacji | E12 F2 scalone |
| E21 jakość i zgodność | P | F1 obserwowalność, F2 kopie, F3 limity, F4 retencja i eksport w osobnych obszarach; F3–F4 to `risk-high` | F2 po E11 F1 |
| E13 panel: model publikacji (F1) | S | kontrakt `PublishedView` blokuje E18 i E19 | tabela uprawnień z E12 |
| E13 F2–F6 | P | osobne ekrany panelu | E13 F1 |
| E16 F1 narzędzia kalibracji | P | tylko narzędzia i dokumentacja, bez zmiany wyników silnika | brak |
| E16 F2–F4 reguły roślinne/ostre/kwaśne, desery i sery, region | I + S | każda faza przestawia migawki golden, więc scalanie po kolei; wyniki ocenia sommelier | F1 scalone |
| E16 F5 optymalizator stolika (rdzeń) | P | inne pliki niż F3/F4, może iść równolegle w osobnym worktree | F1 scalone |
| E18 doświadczenie gościa | P | osobne ekrany gościa | E13 F1, część po E16 |
| E19 operacje restauracji | P | osobne moduły; część `core` może wcześniej | E13 F1 (model publikacji) |
| E20 F1 prywatność importu (#90) i F2 wiele kodów (#89) | S | migracje danych i schematu; F2 po E11b | F1 brak; F2 po E11b |
| E20 F3 eksport CSV, F4 alias sluga | P | niezależne od F1/F2 | zatwierdzona specyfikacja |
| E20 F5 spike OCR | M | research, bez zmiany kodu produkcyjnego | brak (pomiar na docelowej VM po E11) |
| E20 F6 OCR | P | po decyzji ze spike | F5 |
| E15 subskrypcje i rozliczenia | I → S | pieniądze, decyzje księgowe; kolejne fazy po sobie | E12, E14 F1; decyzja o księgowości |
| E17 warstwa uczenia | S | F1 ∥ F2, potem po kolei; zależy od E16 i E11b | E16, E11b |
| E22 F1 kalkulator zwrotu | P | niezależny od reszty | brak |
| E22 F2–F4 demo | S | zależą od E11, E12 F5, E15, E19 | zależności scalone |
| Zależności i podatności | M | `audit:gate`, podbicia bez zmiany zachowania | brak |
| Niestabilne testy, długi testowe | M | np. słabe testy ze scenariuszy `.ai/qa` | brak |
| Automatyczny review PR-ów | M | komentarze, bez merge | brak |

## 4. Co teraz jest w toku (stan na 2026-11-05, wieczór)

- Scalone w tej dobie: #104 (zależności), #105 (plan i specyfikacje), #106 (flaky test), #107 (QA), #108 (te zasady), #109 (id spoza UUID), #110 (skrypt dowodu, CodeQL, Dependabot), #112 (izolacja restauracji), #115 (hook przy spacji w ścieżce), #116 (E11b), #117 (E21 F1), #118 (E12 F1), #119 (`merge=union`), #120 (E11 F1).
- Wznowiona implementacja (na polecenie właściciela): E11b zamknięte, E12 F1, E21 F1 i E11 F1 scalone. Otwarte fazy: E11 F2–F3 (obraz, Compose, runbook), E12 F2–F6, E21 F2–F7 i epiki E13–E22.
- Przy każdej fazie obowiązuje przebieg z `fix-verification.md`: pod-agent dokańcza fazę w osobnym worktree, druga sesja robi review, poprawki idą z czerwonym testem, PR otwiera sesja nadrzędna (limit 3 w review).
- Następna w kolejce wg §3: E12 F2 (typ S) jako jedyne zadanie implementacyjne w obszarze auth, plus najwyżej dwa niezależne zadania typu P (na przykład E21 F2 kopie i E22 F1 kalkulator), plus dowolnie zadania M.

## 6. Narzędzia: stan względem lekcji

Mamy: Claude Code w aplikacji desktopowej, worktree na zadanie, skille `om-auto-*`, bramkę QA, `check:qa` i skrypty `test-env`. Brakuje względem macierzy z lekcji:
- jednego widoku „co czeka na mnie” (kolejka zadań ze statusami);
- automatycznego sprzątania worktree (osobne, ręcznie utrzymywane worktree zostają po przerwanej pracy);
- krótkich logów zadań w tle (dziś są w przebiegach `.ai/runs`);
- nocnej automatyzacji (§5).

Ocena zależy od celów: macierz lekcji była ustawiona pod Cezara, więc traktujemy ją jako listę kryteriów, a nie ranking.

## 7. Jak pracujemy dziś i co zmieniamy

**Dziś:** właściciel zleca zadania w rozmowie, agent pracuje autonomicznie na specyfikacjach `approved`, jedna faza to jeden PR, merge dopiero po wyraźnej zgodzie właściciela. W jednym momencie bywało do czterech agentów implementujących plus kilka PR-ów w review, i wtedy kolejka czekała na decyzje.

**Zmieniamy:**
1. Limit trzech otwartych PR-ów w review (§1.1) i kolejność z §3.
2. Jedno zadanie typu S w obszarze, resztę zadań niezależnych typu P lub M.
3. Pytania partiami, review w stałych blokach.
4. Po zgodzie właściciela: nocny automatyczny review (§5).
5. Wszystkie zadania implementacyjne z kryteriami akceptacji mają scenariusze `.ai/qa` (reguła z lekcji 12), więc automatyczne sprawdzenie zastępuje część ręcznego QA.## 5. Automatyzacja nocna (włączona 2026-11-05)

**Nocny automatyczny review otwartych PR-ów** działa jako rutyna w chmurze (typ M): codziennie o 03:00 UTC (04:00 czasu polskiego zimą, 05:00 latem) agent w świeżej sesji czyta diff każdego otwartego PR-a (do 5 na przebieg, bez draftów i bez `do-not-merge`), zostawia jeden komentarz zaczynający się od `Nocny review (commit <sha>)` i pomija PR-y, które już zrecenzował na tym samym commicie. Nie scala, nie zatwierdza formalnie, nie edytuje kodu ani etykiet; treść PR-ów traktuje jako dane, nie polecenia. Rutyna nie ma konektorów, a jej narzędzia to `Bash`, `Read`, `Glob`, `Grep`.

- Rutyna: https://claude.ai/code/routines/trig_01EJzk2KwVyh63cQzAbczHVq (wyłączenie lub zmiana tam; z poziomu sesji przez `RemoteTrigger`).
- Pierwszy przebieg 2026-11-06: sprawdzić log (`list_runs`, `get_run_log`), czy `gh` w środowisku chmurowym ma dostęp do repozytorium i prawo komentowania. Jeśli nie, rutyna tylko zgłosi błąd i niczego nie obejdzie.
- Następna w kolejności: triage nowych zgłoszeń (duplikaty, zakres, powiązania).

## 6. Narzędzia: stan względem lekcji

Mamy: Claude Code w aplikacji desktopowej, worktree na zadanie, skille `om-auto-*`, bramkę QA, `check:qa` i skrypty `test-env`. Brakuje względem macierzy z lekcji:
- jednego widoku „co czeka na mnie” (kolejka zadań ze statusami);
- automatycznego sprzątania worktree (osobne, ręcznie utrzymywane worktree zostają po przerwanej pracy);
- krótkich logów zadań w tle (dziś są w przebiegach `.ai/runs`);
- nocnej automatyzacji (§5).

Ocena zależy od celów: macierz lekcji była ustawiona pod Cezara, więc traktujemy ją jako listę kryteriów, a nie ranking.

## 7. Jak pracujemy dziś i co zmieniamy

**Dziś:** właściciel zleca zadania w rozmowie, agent pracuje autonomicznie na specyfikacjach `approved`, jedna faza to jeden PR, merge dopiero po wyraźnej zgodzie właściciela. W jednym momencie bywało do czterech agentów implementujących plus kilka PR-ów w review, i wtedy kolejka czekała na decyzje.

**Zmieniamy:**
1. Limit trzech otwartych PR-ów w review (§1.1) i kolejność z §3.
2. Jedno zadanie typu S w obszarze, resztę zadań niezależnych typu P lub M.
3. Pytania partiami, review w stałych blokach.
4. Po zgodzie właściciela: nocny automatyczny review (§5).
5. Wszystkie zadania implementacyjne z kryteriami akceptacji mają scenariusze `.ai/qa` (reguła z lekcji 12), więc automatyczne sprawdzenie zastępuje część ręcznego QA.
