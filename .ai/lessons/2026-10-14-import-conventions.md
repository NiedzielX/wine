---
date: 2026-10-14
updated: 2026-11-27
area: engine
status: active
source: .ai/runs/2026-10-14-import-and-qr.md
promoted: AGENTS.md §1.3
---

# Import plików: testuj na prawdziwych plikach, cały łańcuch, stan formularza i układ tabeli

## Co poszło źle i czego nauczyło
- **Parsery testuj na plikach zrobionych przez inne oprogramowanie** (`packages/db/tests/fixtures/generate.py`: openpyxl, reportlab, PIL, kodowanie Windows-1250), nie na plikach ukształtowanych własnymi założeniami. Excel nie zapisuje pustych komórek na końcu wiersza — czytnik dopełnia wiersze do najszerszego.
- **`\b` w JavaScript nie traktuje liter spoza ASCII (np. `ł`) jako liter.** `58,50 zł` nie było rozpoznawane. Granice słów dla tekstów polskich: `(?<![a-z])…(?![a-z])`, nie `\b`.
- **Etap pośredni mówi słownikiem następnego etapu.** Nagłówek generowany z linii PDF używał nazw pól (`glassPrice`), a detektor kolumn rozpoznaje słowa (`glass price`) — ceny win z PDF znikały. Testuj cały łańcuch (linie → wiersze → rekordy), nie tylko każdy etap osobno.
- **Formularz wysyła stan KAŻDEGO pola.** Odznaczone pole „Import” przy wierszu, który użytkownik właśnie poprawił, nie jest jego decyzją. Traktuj stan jako wybór użytkownika tylko wtedy, gdy RÓŻNI SIĘ od zapisanego (`validate.ts: chose`).
- **Szeroka tabela w siatce rozpycha stronę**, dopóki każdy poziom siatki nie ma `min-w-0` (przewijanie ma być wewnątrz karty).
- **Rozróżniaj „brak pliku” i „pusty plik”:** przeglądarka wysyła pustą nazwę, gdy nic nie wybrano, i prawdziwą nazwę z rozmiarem 0 dla pustego pliku.
- (2026-11-25) **Reguła prefiksu daje fałszywe dopasowanie cen.** „Cena zakupu netto” zaczyna się od synonimu `cena`, więc kolumna kosztu zakupu stawała się ceną dania lub wina, a ceny są danymi bieżącymi widocznymi dla gości bez publikacji; w menu synonimami ceny były nawet `cost` i `koszt`. Nagłówek ze słowem o koszcie zakupu (`isCostHeader` w `mapping.ts`) jest pomijany z uwagą w podglądzie, przed dopasowaniem po prefiksie. Nowy synonim ceny sprawdź przeciwko nagłówkom kosztu (`import.test.ts`: „cost columns are never read as a price”). Uzupełnienie (2026-11-27): dokładny nagłówek („Cena” / „Price”) wygrywa z prefiksowym niezależnie od kolejności, kilku kandydatów tylko-prefiksowych na cenę nie zgadujemy (pusta cena z uwagą), a plik bez nagłówka z kolumną kosztu odrzucamy (`cost_without_header`), bo kolejność domyślna czytałaby koszt jako cenę. Lista rdzeni to `COST_STEMS` w `mapping.ts`, dokumentacja tylko na nią wskazuje.

## Reguły
- Typ pliku po **zawartości** (magic bytes); rozszerzenie niezgodne z zawartością = odmowa, nie zgadywanie. Limity: 10 MB, 2000 wierszy, rozpakowany XLSX ≤ 25 MB (zip bomb), brak parsera XML z encjami (XXE).
- Pliku nie przechowujemy; w bazie tylko to, co z niego odczytano (`storage_key` pusty).
- Duplikaty = aktualizacja, domyślnie niezaznaczona; potwierdzenie atomowe, raz na zadanie (blokada wiersza `FOR UPDATE`).
- Pliki generuj Pythonem, nie heredoc z `${var^}`: `/bin/sh` to `dash`, a pusty plik **przechodzi typecheck** — po generowaniu sprawdź `wc -l`.

## Jak sprawdzić
`npm test` (parsery na prawdziwych plikach), `npm run test:db` (import na PostgreSQL, równoległe zatwierdzenie), przeglądarka: wgraj `menu.xlsx`, `wines.pdf`, `menu-1250.csv`.
