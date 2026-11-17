---
started: 2026-11-16 12:40
ended: 2026-11-16 12:55
agent: Claude Code
spec: brak — drobna poprawka (2 pliki CSS, krok 1 z `2026-11-16-menu-transition-smoothness`, PR #158)
outcome: success
related: [.ai/runs/2026-11-16-menu-transition-diagnosis.md]
---

# Szybka poprawka: `scrollbar-gutter: stable`

## Zadanie
Właściciel poprosił o szybką poprawkę skakania ekranu w menu bez czekania na całą specyfikację. Diagnoza (PR #158): bez `scrollbar-gutter` pasek przewijania znika i wraca, a układ przeskakuje o ok. 15 px.

## Przebieg
`html { scrollbar-gutter: stable; }` w motywie panelu (`packages/ui/src/styles.css`) i gościa (`guest.css`). Test kontraktu CSS w `packages/app/tests/unit/scrollbar-gutter.test.ts`. Wpis w CHANGELOG. Pozostałe przyczyny (P2–P6) zostają w specyfikacji.

## Weryfikacja
`lint`, `typecheck`, `npm test` (app 767, core 126, db 62, ui 579, testkit 675), `build`, `check:design`, `check:context` (0 błędów), `secrets:scan`: czysto. Nie sprawdzano w przeglądarce z klasycznym paskiem przewijania.

## Wynik
Pasek przewijania nie powinien już zmieniać szerokości układu; pozostałe przyczyny (P2–P6) w specyfikacji z PR #158.

## Lekcje
brak
