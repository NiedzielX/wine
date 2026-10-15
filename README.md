# Wine Match

Klikalne mockupy Wine Match dla restauracji Halka (Warszawa): goście dobierają wino do dania lub całego stołu, a sommelier zarządza parowaniami w panelu admina.

## Uruchomienie

Wszystko jest w jednym pliku: otwórz `index.html` w przeglądarce. Nie trzeba niczego budować.

Główne ścieżki (hash routing):

- `#/r/halka` — widok gościa (menu, dania, dobór wina, „Whole table”)
- `#/r/halka/staff` — szybki podgląd parowań dla obsługi
- `#/admin` — panel sommeliera (menu, karta win, review parowań, publikacja, QR)

Stan demo jest zapisywany w `localStorage` (klucz `winematch.demo.v1`).

## Uwaga

`index.html` to zbudowany (zminifikowany) bundle Vite przeniesiony z artefaktu Claude. Oryginalne źródła (TS/CSS) nie są jeszcze w repo.
