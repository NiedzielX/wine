---
status: implemented
created: 2026-10-14
owner: Filip
related: [.ai/specs/2026-10-14-mockups-to-app-migration-plan.md, .ai/specs/implemented/2026-10-14-phase4-authentication.md, .ai/runs/2026-10-14-import-and-qr.md]
superseded_by:
---

# Faza 5 — import menu i karty win, QR, ekran Setup

> Zakres z planu migracji; decyzje poniżej podjął agent według `AGENTS.md` (polecenie właściciela: „działaj, faza 5”). Do przeglądu.

## Problem
Menu i kartę win można dziś tylko oglądać: nowe dania i wina trafiają do systemu wyłącznie z danych demo. Restauracja nie może zacząć pracy z własnymi plikami, nie ma kodu QR na stoły ani ekranu prowadzącego przez wdrożenie.

## Cel i zakres
Import menu i karty win z plików CSV, XLSX i PDF po stronie serwera z podglądem i poprawkami przed zapisem; generowanie kodu QR (SVG i PNG) ze stojakiem do druku; ekran Setup (dane restauracji i lista kroków wdrożenia).
**Poza zakresem:** import sprzedaży (Faza 6), OCR skanów PDF, stare binarne `.xls`, edycja pojedynczego dania i wina (profile, ceny) poza importem, zarządzanie użytkownikami.

## Decyzje
| Temat | Decyzja | Uzasadnienie |
|---|---|---|
| Podział | porty i logika (`ImportService`, mapowanie kolumn, walidacja, plan zapisu) w `core`; parsery plików w `db` pod `@wine-match/db/import` (bez MikroORM), port `ImportFileParser` | `core` nie może zawierać bibliotek plikowych; ten sam wzorzec co `@wine-match/db/auth` |
| XLSX | własny, minimalny czytnik na `fflate` (zip + XML): wspólne ciągi, `inlineStr`, liczby; limit rozpakowanego rozmiaru 25 MB (ochrona przed zip bomb); brak parsera XML z encjami (brak XXE) | brak ciężkiej zależności; kontrola nad bezpieczeństwem |
| PDF | `unpdf` (pdf.js): tylko tekst; heurystyka linii „nazwa … cena”; **najlepsza próba, każdy wiersz do sprawdzenia**; skan bez tekstu = czytelny błąd (OCR poza zakresem) | PDF nie ma tabel; uczciwy komunikat zamiast udawanej precyzji |
| CSV | UTF-8 lub Windows-1250 (polski Excel), separator `,` `;` lub tab, przecinek dziesiętny | typowe pliki z polskich lokali |
| Limity | 10 MB, 2000 wierszy, rozszerzenia csv/tsv/txt/xlsx/pdf; `.xls` odrzucone z podpowiedzią „zapisz jako .xlsx lub CSV”; typ wykrywany po zawartości (magic bytes), nie po rozszerzeniu | bezpieczeństwo, jasny komunikat |
| Plik | nie jest zapisywany (`storage_key` pusty); w bazie tylko metadane i przeanalizowane wiersze | prywatność; mniej do ochrony |
| Duplikaty | danie o tej samej nazwie (bez wielkości liter i spacji) i wino o tym samym producencie + nazwie + roczniku = „aktualizacja”: domyślnie **niezaznaczona**; po zaznaczeniu zmienia opis / kategorię / cenę (danie) lub ceny (wino), nie profil ani pairingi | bezpieczna domyślna; zgodnie z E6 w `USE_CASES.md` |
| Nowe dane | dania jako `draft` z profilem `draft` (reguły), wina aktywne z profilem z domyślnych szczepu; propozycje silnika dla nowych pozycji (dodane jako `suggested`, nie zmieniają tego, co widzą goście) | jak w mockupach i `USE_CASES.md` |
| Atomowość | zapis (`confirm`) w jednej transakcji z oznaczeniem zadania jako zakończonego; drugi `confirm` tego samego zadania = błąd | brak podwójnego importu |
| Uprawnienia | nowe uprawnienie `import.manage` (Sommelier, GM, Owner); edycja danych restauracji i sluga: tylko Owner / GM (`restaurant.edit`) | macierz `USER_ROLES.md`, spec A10 |
| QR | adres `{PUBLIC_BASE_URL}/r/{slug}` (domyślnie `http://localhost:3000`); `GET /api/v1/restaurants/{slug}/qr?format=svg|png&size=` za sesją; korekcja błędów M | adres gościa to `/r/{slug}`, nie domena z koncepcji |
| Slug | zmiana: `^[a-z0-9-]{2,40}$`, unikalny, zarezerwowane (`login`, `api`, `r`, `admin`); ostrzeżenie, że zmiana unieważnia wydrukowane kody | kody QR zawierają slug |
| Upload w UI | akcja serwerowa z plikiem (`bodySizeLimit` 11 MB); formularze działają bez JS | spójne z resztą panelu |
| REST | `POST /imports/menu`, `POST /imports/wines` (multipart), `GET /imports/{id}`, `PATCH /imports/{id}/rows`, `POST /imports/{id}/confirm`, `DELETE /imports/{id}`; adresowanie przez `?restaurant={slug}` | zgodnie ze specyfikacją API |

## Wymagania
- R1 `core`: mapowanie kolumn (PL/EN), normalizacja (ceny, rocznik, styl, kategoria), walidacja z poziomami błąd / ostrzeżenie, wykrywanie duplikatów, `ImportService` (upload, get, updateRows, confirm, cancel, regenerateSuggestions), porty `ImportRepository` i `ImportFileParser`, kontrakt repozytorium.
- R2 `db`: parsery (CSV, XLSX, PDF) z testami na prawdziwych plikach, `PgImportRepository`, rozszerzenia repozytoriów (restauracja, propozycje), migracja jeśli potrzebna.
- R3 `app`: ekrany A8, A9, A10, A12; akcje serwerowe; REST importu i QR.

## Kryteria akceptacji
- [x] AC1 Parsery przechodzą testy na prawdziwych plikach: XLSX (z Excela/openpyxl), PDF (reportlab), CSV w UTF-8 i Windows-1250 z `;`; błędne, puste, zbyt duże, skan PDF, `.xls`, podszyte rozszerzenie → czytelne błędy.
- [x] AC2 Test integracyjny na PostgreSQL: upload → podgląd → poprawki → zatwierdzenie tworzy dania / wina i propozycje; duplikaty; atomowość; drugi `confirm` odrzucony; izolacja restauracji.
- [x] AC3 Nowe dania są `draft`, nowe wina aktywne, propozycje `suggested`; goście nie widzą zmian przed publikacją (dania draft) i nie dostają „Sommelier recommendation”.
- [x] AC4 Ekrany A8 / A9 / A10 / A12 działają w przeglądarce (upload prawdziwych plików XLSX, PDF, CSV; poprawka błędnego wiersza; zatwierdzenie); QR odczytany dekoderem daje właściwy adres.
- [x] AC5 Uprawnienia: import i QR dostępne dla ról z macierzy; dane restauracji i slug tylko Owner / GM; API bez sesji = 401.
- [x] AC6 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone; granice pakietów zachowane.

## Projekt rozwiązania
`core/src/import/` (`mapping.ts`, `validate.ts`, `import-service.ts`, typy), porty w `ports/import.ts`; `db/src/import/` (`csv.ts`, `xlsx.ts`, `pdf.ts`, `parse-file.ts`, index) i `repositories/import.ts`; `app`: `(admin)/admin/[slug]/import/{menu,wines}`, `setup`, `qr`, akcje, REST.

## Ryzyka i otwarte pytania
- PDF: jakość zależy od układu pliku; użytkownik zawsze widzi i poprawia każdy wiersz przed zapisem.
- Zmiana sluga psuje wydrukowane kody QR (ostrzeżenie w UI; przekierowanie ze starego sluga poza zakresem).
- Plik nie jest przechowywany: nie da się ponownie otworzyć podglądu po zamknięciu zadania (podgląd żyje w `import_job.rows`).

## Realizacja
- Log: `.ai/runs/2026-10-14-import-and-qr.md`; lekcja: `import-conventions`.
- **`core`:** `import/` (normalizacja, mapowanie kolumn PL/EN, heurystyka PDF, walidacja, `ImportService`), `RestaurantService`, `AdminService.setup`, porty `ImportRepository`, `addSuggestions`, `updateDetails`, uprawnienia `import.manage` i `restaurant.edit`, magazyn w pamięci i kontrakt `ImportRepository`; 208 testów.
- **`db`:** `@wine-match/db/import` (CSV, własny czytnik XLSX na `fflate`, PDF na `unpdf`), `PgImportRepository` (transakcja z blokadą wiersza), migracja `import_job_notes_and_result`, pliki testowe z openpyxl / reportlab / PIL; 25 testów jednostkowych i 45 integracyjnych.
- **`app`:** ekrany A8, A9, A10, A12, akcje serwerowe z uploadem, `action-runner`, kod QR, REST importu i QR, nawigacja z grupą „Restaurant”, układ do druku.
- **Odstępstwa od specyfikacji:** brak (dodatkowo: endpoint próbek CSV, lista ostatnich importów, `generateSuggestions` w Setup).
- **Błędy znalezione weryfikacją:** (1) `58,50 zł` nie rozpoznawane (`\b` a `ł`); (2) ceny win z PDF znikały (nagłówek z innym słownikiem niż detektor kolumn); (3) błąd bazy z unikalności wyciekał z repozytorium importu (brak tłumaczenia); (4) po poprawce błędu wiersz nie był zaznaczany (formularz wysyła stan każdego pola); (5) podgląd przy 390 px rozpychał stronę do 1618 px (`min-w-0`); (6) pusty plik dawał „wybierz plik”; (7) dwa puste pliki stron po bashizmie w `dash`, które przeszły typecheck.
- **Weryfikacja:** typecheck; 208 + 25 testów jednostkowych; 45 integracyjnych na PostgreSQL (kontrakt importu jak w pamięci, równoległe zatwierdzenie, prawdziwe pliki, druga restauracja); `schema:check`; `build` z granicami; `npm run smoke` 155/155 w `memory` i `postgres`; przeglądarka na PostgreSQL: import XLSX / PDF / CSV w Windows-1250, poprawka wiersza, podwójne zatwierdzenie w dwóch kartach, pliki odrzucane (skan, `.xls`, fałszywy `.xlsx`, `.docx`, pusty), widok gościa bez szkiców, kod QR odczytany dekoderem (PNG i SVG), układ do druku, Setup, zmiana sluga (adres gościa, sesja, QR), bez JS, 390 px.
