---
date: 2026-11-27
updated:
area: testing
status: active
source: .ai/runs/2026-11-27-orchestration-session.md
promoted:
---

# Pliki e2e biegną po kolei na jednej bazie: test zaczyna od stanu bazowego i bierze dane z tego, co strona renderuje

## Kontekst
Dwa testy w `packages/app/tests/e2e/` padły w CI. (1) Test symulatora wyborów obiecuje równość „po symulacji = po publikacji”; padał, bo wcześniejszy plik zostawił w bazie niepublikowaną decyzję. (2) Test strony G3 wybierał danie i wino z listy API z `limit=6`, a strona domyślnie pokazuje 4 pozycje, więc wybrana para nie istniała na stronie.

## Przyczyna
Pliki e2e korzystają ze wspólnej bazy i wykonują się jeden po drugim. Stan zostawiony przez wcześniejszy plik zmienia wynik późniejszego.

## Reguła
- Test, którego wynik zależy od stanu bazy (publikacja, decyzje, ukrycia), zaczyna od jawnego stanu bazowego (opublikowany, bez zaległych zmian) i nie zakłada, że poprzedni plik posprzątał.
- Dane do kliknięcia bierz z tego, co strona faktycznie renderuje (HTML), nie z osobnego zapytania API o innym limicie lub filtrze.

## Jak sprawdzić
Uruchom plik osobno oraz po plikach zmieniających katalog lub publikację (`npm run test:e2e`); wynik ma być taki sam.
