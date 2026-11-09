# Szablony: specyfikacja, log przebiegu, lekcja

Przeniesione z `AGENTS.md` (§2, §3, §4, §5, §6.1, §8); treść przeniesiona z drobnymi zmianami łączników (nagłówki, odwołania do sekcji). Używaj przy zakładaniu nowego pliku w `.ai/`. Reguły zostają w `AGENTS.md`; tu są szablony, drzewo katalogów i uzasadnienia.

### Struktura `.ai/` (AGENTS.md §2)

```
.ai/
├─ specs/                 specyfikacje do Spec-Driven Development (SDD)
│  ├─ YYYY-MM-DD-slug.md  specyfikacje aktywne: draft, approved, in-progress
│  ├─ implemented/        specyfikacje w pełni zrealizowane
│  └─ archive/            specyfikacje porzucone lub zastąpione
├─ runs/
│  └─ YYYY-MM-DD-slug.md  log każdego autonomicznego przebiegu agenta
├─ lessons.md             indeks lekcji: jedna linia na lekcję, najnowsze na górze
└─ lessons/
   └─ YYYY-MM-DD-slug.md  pełna treść lekcji
```

### Planowanie złożonych zadań (AGENTS.md §3)

Specyfikacja jest planem. Wysiłek wkładaj w plan, tak aby implementacja przeszła w jednym podejściu:
- „Projekt rozwiązania” wymienia pliki do zmiany, kolejność kroków i to, jak zostanie sprawdzone każde kryterium akceptacji (test, polecenie, ekran).
- Niejasności rozstrzygaj przed akceptacją — im dokładniejszy spec, tym mniej poprawek.
- Zanim poprosisz o akceptację, zleć przegląd specyfikacji niezależnemu agentowi (świeży kontekst lub pod-agent) w roli doświadczonego inżyniera: brakujące przypadki brzegowe, konflikty z sekcją 7, nietestowalne kryteria. Wnioski wpisz do specyfikacji.

### Awans lekcji do zasad (AGENTS.md §5)

Celem awansu jest malejąca liczba powtarzanych błędów; reguły, które przestały być potrzebne, usuwaj z `AGENTS.md`, żeby pozostał krótki. Lekcja awansowana ma pole `promoted: AGENTS.md §<nr>`, a jej linia w `.ai/lessons.md` może być minimalna (tytuł i odnośnik do sekcji), bo regułę wczytuje już `AGENTS.md`.

### Najpierw działające, potem właściwe (AGENTS.md §6.1)

Jeśli poprawka działa, ale jest doraźna, zadaj sobie pytanie „wiedząc to, co wiem teraz, jak wyglądałoby eleganckie rozwiązanie?” i wdróż je, jeśli mieści się w zakresie. Jeśli nie — zapisz dług techniczny w „Wyniku” logu. „Naprawione” to hipoteza, nie dowód: dowodem jest `verify:regression` (`.ai/docs/fix-verification.md` §3).

### Kiedy pod-agent, kiedy nie (AGENTS.md §8)

Pod-agent daje jakość i oszczędza uwagę agenta głównego, ale zwiększa łączny koszt tokenów (startuje z pustym oknem). Używaj go do researchu, przeglądu, weryfikacji i prac, które da się zrównoleglić; nie do małej zmiany w jednym pliku. Brief zawiera cel, pliki do przeczytania i to, co już wykluczono.

### Szablon specyfikacji

```markdown
---
status: draft            # draft | approved | in-progress | implemented | superseded | abandoned
created: YYYY-MM-DD
owner: <człowiek odpowiedzialny>
related: []              # inne specyfikacje, runs, lessons
superseded_by:           # tylko w archive/
author_model:            # model, który napisał specyfikację (np. claude-opus-5-5), albo "not recorded"
reviewed_by:             # model niezależnego recenzenta (inny niż autor), albo "not recorded (independent agent, model unknown)"
---

# <Tytuł>

## Problem
Co jest nie tak lub czego brakuje, dla kogo, skąd wiemy.

## Cel i zakres
Co zmieniamy. **Poza zakresem:** czego świadomie nie robimy.

## Wymagania
Ponumerowane (R1, R2…), testowalne.

## Kryteria akceptacji
- [ ] AC1 …   (każde sprawdzalne testem lub opisanym krokiem w UI)

Każde AC dotyczące zachowania widocznego w UI lub API ma scenariusz w `.ai/qa/{AREA}/` (konwencja i szablon: `.ai/qa/README.md`) i test integracyjny w `packages/app/tests/e2e/`. W specyfikacji podaj identyfikatory scenariuszy przy AC albo w „Projekcie rozwiązania”.

## Projekt rozwiązania
Pliki, moduły, zmiany w modelu danych / API / regułach silnika, wpływ na ekrany (ID z docs/SCREEN_MAP.md).

## Ryzyka i otwarte pytania

## Changelog
- YYYY-MM-DD — Autor/recenzent: <model autora> / <model recenzenta> (źródło dowodu: log przebiegu albo wpis w specyfikacji).

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
```

**Konwencja „autor i recenzent” (dowód niezależnego przeglądu).** `author_model` i `reviewed_by` w frontmatterze oraz jedna linia „Autor/recenzent” w sekcji Changelog podają, **który model** napisał specyfikację i który ją przejrzał. Wpisujemy tylko to, co wynika z repozytorium (log przebiegu w `.ai/runs/`, wpis w Changelog); nigdy nie zgadujemy nazwy modelu. Gdy tekst mówi „przegląd niezależny”, a modelu nie podaje, wpisz `reviewed_by: not recorded (independent agent, model unknown)`. Gdy przeglądu nie było albo nie ma po nim śladu, zostaw pola puste lub `not recorded`. Recenzent powinien być innym modelem niż autor (AGENTS.md §3); klucze są opcjonalne dla `check:context`, który nie waliduje frontmattera specyfikacji.

### Szablon logu

```markdown
---
started: YYYY-MM-DD HH:MM
ended: YYYY-MM-DD HH:MM   # puste, jeśli przebieg został przerwany
agent: <np. Claude Code / claude-opus-5-5>
spec: .ai/specs/...md     # lub "brak — drobna poprawka"
outcome: success | partial | failed | aborted
related: []
---

# <Co było do zrobienia, jednym zdaniem>

## Zadanie
Polecenie człowieka lub spec, własnymi słowami.

## Przebieg
Chronologicznie, krótko: decyzje i dlaczego, ślepe uliczki, zmienione pliki.

## Weryfikacja
Uruchomione polecenia i wyniki (typecheck, testy, build, ręczne sprawdzenie ekranów).

## Wynik
Co działa, co nie, co zostało do zrobienia.

## Lekcje
Odnośniki do lekcji utworzonych w tym przebiegu (albo „brak”).
```

### Szablon lekcji

```markdown
---
date: YYYY-MM-DD
updated:                 # data ostatniej aktualizacji
area: engine | guest-ui | admin-ui | import | build | tooling | process | docs
status: active           # active | obsolete
source: .ai/runs/...md   # przebieg, w którym powstała
promoted:                # np. AGENTS.md §6.1, jeśli lekcja stała się regułą
---

# <Tytuł jako reguła, np. „Dzieci siatki CSS muszą mieć min-width: 0”>

## Kontekst
Co się stało, gdzie, objawy.

## Przyczyna

## Reguła
Co robić odtąd. Konkretnie, w trybie rozkazującym.

## Jak sprawdzić
Test, polecenie lub krok weryfikacji.
```
