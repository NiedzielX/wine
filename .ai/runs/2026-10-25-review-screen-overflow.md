---
started: 2026-10-25 14:00
ended: 2026-10-25 14:30
agent: Claude Code
spec: brak — poprawka błędu w jednym miejscu (issue #60)
outcome: success
related: [.ai/runs/2026-10-25-agent-security-hardening.md]
---

# Ekran przeglądu par (A7) nie przewija się poziomo przy 390 px (issue #60)

## Zadanie
Issue #60: przy 390 × 844 strona A7 (`/admin/{slug}/review`) miała 482 px szerokości, bo nagłówek grupy dania (znaczek „No primary pick yet” i przyciski) się nie zawijał.

## Przebieg
- Reprodukcja na aktualnym buildzie (`next start`, `DATA_SOURCE=memory`, konto demo sommeliera, Chromium): `scrollWidth` 482 przy 390 px, 390 przy 1440 px. Winowajcą jest kontener akcji `div.flex.shrink-0.items-center` w nagłówku grupy.
- Poprawka w `review/page.tsx`: nagłówek karty dostał `flex-wrap`, kontener akcji `flex-wrap` zamiast `shrink-0`; przyciski przechodzą do drugiego wiersza.
- Pierwszy pomiar „po” poszedł do starego serwera (proces z poprzedniego builda nadal działał), więc wynik był taki sam jak przed poprawką; po zatrzymaniu go i restarcie z nowego builda wynik był poprawny.

## Weryfikacja
- Przed: 390 px → `scrollWidth` 482 (elementy: kontener akcji i link „Open pairings” kończą się na 482 px). Po: 390 px → `scrollWidth` 390, 1440 px → 1440; brak elementów poza ekranem poza kontenerami przewijanymi.
- Zrzut ekranu po poprawce przy 390 px: nagłówek „Beef tartare” z przyciskami „Approve all for this dish” i „Open pairings” w drugim wierszu.
- `npm run lint`, `typecheck`: zielone; `npm test -w @wine-match/app`: 353 testy zielone; `npm run build -w @wine-match/app`: zielone.
- Test automatyczny nie powstał: układ strony sprawdza się w przeglądarce (AGENTS §6.1, 390 i 1440 px); w repo nie ma testu opartego na klasach CSS ani przeglądarki w testach jednostkowych.

## Wynik
Poprawka gotowa na gałęzi `fix/issue-60-review-overflow`. Dług: brak automatycznego testu poziomego przewijania ekranów panelu przy 390 px.

## Lekcje
Brak (znany wzorzec: `shrink-0` na grupie akcji blokuje zawijanie).
