---
date: 2026-11-05
updated:
area: tooling
status: active
source: .ai/runs/2026-11-05-staff-code-test-flake.md
promoted:
---

# Test nie wpisuje na sztywno wartości, które generator losowych id może wyprodukować

## Kontekst
`packages/app/tests/unit/staff-code.test.ts` (AC8, „unknown, foreign and yesterday's codes”) padł raz na CI (PR #87) z `marked=undone` zamiast `codeError=not_found`, a lokalnie przechodził. Wyglądało na test zależny od czasu (`yesterday()` z `Date.now()`).

## Przyczyna
Nie czas. Kod polecenia powstaje z losowego UUID (`codeFromUuid`), a test sprawdzał „nieznany/wczorajszy” kod wpisany na sztywno (`H8H`, `C3C`, `X9X` …) w tej samej restauracji i tym samym dniu serwisowym co kody wydawane przez inne testy. Gdy los wylosował `H8H`, polecenie „cofnij” znajdowało dzisiejszy kod. Odtworzone celowo: serwis z wymuszonym UUID-em dającym `H8H` wywraca oryginalny test dokładnie tym komunikatem. Szansa kolizji jest rzędu kilku procent na przebieg.

## Reguła
Test, który sprawdza „brak”, „inny” albo „wczoraj” przez wartość wpisaną na sztywno, nie może dzielić przestrzeni wartości z generatorem losowych id. Wstrzyknij generator, który omija te wartości (`idGenerator` w `RecommendationCodeService`), albo wygeneruj wartość i sprawdź, że nie istnieje. Podejrzewając flake, najpierw sprawdź, czy nie ma kolizji losowych id z literałami, zanim założysz, że winny jest czas.

## Jak sprawdzić
`packages/app/tests/unit/staff-code.test.ts`: test „the test service never issues a code this file picks by hand” losuje 20 000 UUID-ów i wymaga, żeby żaden nie dał kodu z `HAND_PICKED_CODES`.
