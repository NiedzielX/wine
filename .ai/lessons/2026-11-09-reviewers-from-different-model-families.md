---
date: 2026-11-09
updated:
area: process
status: active
source: .ai/runs/2026-11-09-lesson-21-multi-model-review.md
promoted:
---

# Niezależne review to różne rodziny modeli, to samo wejście i triage każdej uwagi z dowodem, nie głosowanie

## Kontekst
Lekcja 21 kursu (praca wielomodelowa). Błędy silnych modeli są coraz bardziej skorelowane, recenzent tej samej rodziny ma te same ślepe plamy i wyżej ocenia tekst swojej rodziny, a recenzent, który widzi zdanie autora, zwykle się z nim zgadza. Zgoda kilku modeli nie jest dowodem (potrafią zgodnie potwierdzić wymyślone pojęcie). U nas wszystkie sesje i pod-agenty to dziś Claude, więc „dwa niezależne review” przy `risk-high` to w praktyce dwa przebiegi jednej rodziny.

## Przyczyna
Niezależność recenzenta zależy od trzech rzeczy naraz: innej rodziny modelu, identycznego wejścia bez uzasadnienia autora i tego, że orkiestrator ocenia każdą uwagę osobno. Kolejny przebieg tego samego modelu bywa przydatny, ale nie jest niezależną opinią.

## Reguła
- Recenzenci z co najmniej dwóch rodzin modeli, gdy druga jest dostępna; dopóki nie jest, raport podaje wprost „review: N, rodziny: 1”.
- Każdy recenzent dostaje to samo (diff, spec, kryteria, reguły repo), bez uzasadnień autora i wyników innych recenzentów; wejście i wyjście zgodne z `.ai/schemas/`, sprawdzone `npm run review:validate`.
- Każdą uwagę, także zgłoszoną przez jednego recenzenta, orkiestrator odtwarza w kodzie i klasyfikuje (`prawdziwa` / `halucynacja` / `poza zakresem`) z jednym zdaniem dowodu; nigdy większością głosów.
- Najwyżej 3 rundy review specyfikacji i 3 kodu; prośba o poprawkę zawsze z dowodem (padający test, wejście z błędnym wynikiem, wymaganie), nigdy „sprawdź jeszcze raz”.
- Pełny przepływ wielomodelowy tylko dla `risk-high` lub dużego modułu z pełną specyfikacją; małe zmiany robi jeden agent.
Szczegóły: `.ai/docs/review-protocol.md` §9, lista „triage” w `.ai/docs/review-checklists.md`.

## Jak sprawdzić
`packages/testkit/tests/review-validate.test.ts` (pole `authorRationale` w paczce pada, runda 4 pada, ustalenie bez dowodu pada, odpowiedź do innego wejścia pada); `packages/testkit/tests/review-pack.test.ts` (lista „triage” nie trafia do paczki recenzenta). W logu przebiegu z review: tabela uwag z klasyfikacją i dowodem oraz liczba rodzin.
