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

## Projekt rozwiązania
Pliki, moduły, zmiany w modelu danych / API / regułach silnika, wpływ na ekrany (ID z docs/SCREEN_MAP.md).

## Ryzyka i otwarte pytania

## Realizacja
(Uzupełnia agent po implementacji: commit(y), log przebiegu, odstępstwa od projektu.)
```

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
