---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-14-phase5-import-and-qr.md
outcome: success
related: [.ai/runs/2026-10-14-authentication.md]
---

# Migracja — Faza 5: import menu i karty win, QR, Setup

## Zadanie
Polecenie właściciela: „działaj, faza 5”. Pierwsza nieukończona faza planu: Faza 5.

## Przebieg
1. Przeczytano plan i lekcje; stan bazowy zielony (Faza 4). Zapisano specyfikację z decyzjami (parsery w `db`, własny czytnik XLSX na `fflate`, `unpdf` dla PDF, limity, duplikaty jako domyślnie niezaznaczone aktualizacje, QR pod `/r/{slug}`). Do testów dostępne prawdziwe narzędzia: `openpyxl`, `reportlab`, `cv2` (odczyt QR).
2. Pliki testowe wygenerowane narzędziami zewnętrznymi (`generate.py`: openpyxl, reportlab, PIL, kodowanie Windows-1250). Parsery w `db` (CSV, własny czytnik XLSX, PDF), potem logika importu w `core` (normalizacja, mapowanie, walidacja, `ImportService`), kontrakt `ImportRepository`, `PgImportRepository`, migracja, `app` (A8–A12, akcje, REST, QR).
3. Błędy i ślepe uliczki:
   - **`58,50 zł` nie rozpoznawane** — test jednostkowy to wykrył; `\b` w JS nie traktuje `ł` jako litery. Przy naprawie wstawiłem komentarz `//` w środek długiej linii łańcucha i zepsułem pozostałe `.replace`; test to natychmiast pokazał (5 nowych porażek), komentarz przeniesiony.
   - **Ceny win z PDF znikały** — wykryte dopiero testem integracyjnym na prawdziwym PDF: nagłówek z moich linii używał nazw pól, a detektor kolumn zna słowa. Test jednostkowy sprawdzał tylko surowe wiersze. Dopisany test całego łańcucha.
   - **Błąd bazy wyciekał z `PgImportRepository.confirm`** (brak `translate`) — wykryty przez kontrakt (atomowość). `translate` wydzielony do wspólnego pliku.
   - **Poprawiony wiersz nie był zaznaczany** — wykryte w przeglądarce: formularz zawsze wysyła stan każdego pola, więc odznaczenie było czytane jako wybór użytkownika. Reguła: liczy się tylko zmiana względem zapisanego stanu; 2 nowe testy jednostkowe.
   - **Podgląd rozpychał stronę do 1618 px przy 390 px** — wykryte w przeglądarce; `min-w-0` na poziomach siatki.
   - **Pusty plik dawał „Choose a file”** — rozdzielone „brak pliku” i „pusty plik”.
   - **Dwa puste pliki stron** po bashizmie `${kind^}` w `dash`; `typecheck` przeszedł. Powtórzenie klasy błędu z lekcji `posix-shell-in-scripts` — lekcja uzupełniona; pliki generuję teraz Pythonem i sprawdzam rozmiar.
   - Środowisko i skrypty testowe: PostgreSQL w sandboxie zatrzymał się w trakcie (restart), kolizja `A` w smoke, atrybuty `pattern` przywracane po przeładowaniu, `inner_text` nie zawiera wartości pól formularza, test typów w teście niewidoczny dla Vitest (wyłapał `typecheck`).

## Weryfikacja
- `npm run typecheck` OK; `npm test` — 208 (core) + 25 (db); `npm run test:db` — 45 na PostgreSQL 16; `schema:check` zgodny; `npm run build` OK z granicami pakietów (Next.js bundluje `unpdf` i `fflate`).
- `npm run smoke`: `memory` 155/155, `postgres` 155/155 (niczego nie zmienia w danych: każdy import kończy się anulowaniem).
- Playwright na PostgreSQL: pełny przepływ importu na prawdziwych plikach, QR odczytany dekoderem OpenCV (PNG i SVG), druk, Setup i zmiana sluga, bez JS, 390 px, brak błędów w konsoli.

## Wynik
Faza 5 zakończona (AC1–AC6). Następna i ostatnia: Faza 6 (analityka, import sprzedaży, wycofanie mockupów). Dług: PDF bez OCR i tabel; brak przekierowania ze starego sluga; testy przeglądarkowe nadal poza repozytorium; CI nieuruchomione.

## Lekcje
- `.ai/lessons/2026-10-14-import-conventions.md` (awans do `AGENTS.md` §1.3)
- uzupełniona: `posix-shell-in-scripts`
