---
date: 2026-10-14
updated:
area: build
status: active
source: .ai/runs/2026-10-14-mvp-mockups.md
---

# Do udostępnienia mockupów jako jednego pliku HTML użyj `vite-plugin-singlefile`, z wbudowanym faviconem i bez manifestu

## Kontekst
Mockupy trzeba było pokazać jako jedną stronę (hostowany artifact), bez serwera i bez zewnętrznych zasobów. Zwykły `vite build` tworzy osobne pliki JS, CSS i fontów.

## Przyczyna
Hosting pojedynczego pliku nie serwuje ścieżek `/favicon.svg` ani `/manifest.webmanifest` z `public/`, a fonty z `@fontsource` są domyślnie osobnymi plikami.

## Reguła
- Zainstaluj tymczasowo `vite-plugin-singlefile` (`npm install --no-save`), nie dodawaj go do zależności projektu.
- Konfiguracja: `plugins: [viteSingleFile()]`, `build.assetsInlineLimit` bardzo duży, `cssCodeSplit: false`.
- W kopii `index.html` zamień favicon na `data:` URI i usuń link do manifestu.
- Buduj na kopii `packages/mockups`, żeby nie nadpisać jego `index.html`.
- Wynik (~380 kB) działa offline, także z `file://`; stan demo nadal w `localStorage`.

## Jak sprawdzić
Otwórz plik przez `file://`, przejdź na `#/admin/qr` po zalogowaniu: kod QR się renderuje, a `document.fonts.check('16px "Bodoni Moda Variable"')` zwraca `true`. W pliku nie ma odwołań `https://` poza `winematch.app` i przestrzenią nazw SVG.
