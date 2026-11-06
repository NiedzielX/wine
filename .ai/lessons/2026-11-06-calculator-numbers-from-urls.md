---
date: 2026-11-06
area: guest-ui
status: active
source: .ai/runs/2026-11-06-e22-f1-roi-calculator.md
---

# Liczby z adresu: iloczyny przed dzieleniem, sześć miejsc po przecinku, jedna czysta ścieżka

## Kontekst
Kalkulator zwrotu (E22 F1) przyjmuje siedem liczb z URL-a i buduje z nich linki do siebie (druk, zmiana języka). Dwie pułapki wyszły dopiero w testach granicznych.

## Przyczyna
1. `1500 * 0.05 * 150` w liczbach zmiennoprzecinkowych daje `11250.000000000002`; „dokładny” rachunek na kwotach nie przechodzi `toBe`.
2. Liczba parsowana z napisu `0.0000001` drukuje się przez `String()` jako `1e-7`, a wzorzec wejścia (`^-?\d+([.,]\d+)?$`) odrzuca wykładnik: link zbudowany ze strony nie czytałby się z powrotem.

## Reguła
Procenty trzymaj w procentach i mnóż przed dzieleniem przez 100 (całkowite wejścia dają całkowite wyniki); wynik czyść `Number(x.toPrecision(14)) + 0` (szum bitów i `-0`). Wartości z URL-a zaokrąglaj do sześciu miejsc po przecinku przy parsowaniu, żeby `String()` nigdy nie dał wykładnika; test: odczyt, wydruk, ponowny odczyt daje to samo. Do HTML-a smoke’a i testów e2e sprawdzaj „NaN/undefined” na tekście bez tagów i skryptów: ładunek RSC zawiera słowo `undefined` w poprawnej stronie.

## Jak sprawdzić
`packages/core/tests/roi.test.ts` (bez szumu, granice, odczyt zwrotny), `smoke --showcase`.
