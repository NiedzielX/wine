# Szablony: specyfikacja, log przebiegu, lekcja

Przeniesione z `AGENTS.md` (§3, §4, §5) bez zmiany treści. Używaj przy zakładaniu nowego pliku w `.ai/`.

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
