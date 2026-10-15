# Wine Match — statyczne mockupy

Klikalne mockupy wszystkich ekranów MVP (Vite + TypeScript, bez backendu, stan w `localStorage`). Służą do pokazów produktu; kod produkcyjny jest w `packages/app`. Silnik, typy i dane demo pochodzą z `@wine-match/core`.

```bash
npm run dev:mockups    # z katalogu głównego repozytorium
```

Strona startowa (`#/`) to indeks wszystkich ekranów obu aplikacji.

**Logowanie do panelu:** dane demonstracyjne są wpisane (`marta@halka.pl`, dowolne hasło z min. 6 znakami). Można zalogować się jako Wine Director albo General Manager.

**Aplikacja gościa** jest mobile-first: najlepiej otworzyć ją na telefonie w tej samej sieci (`npm run dev:mockups -- --host`) albo w trybie urządzenia mobilnego w DevTools.

## Co można przeklikać

**Gość** (`#/r/halka`): landing → lista dań → szczegóły dania z szybkimi preferencjami → rekomendacje → filtry → szczegóły wina → potwierdzenie „Show this to your waiter”; tryb „Whole table” → wybór kilku dań → „Best wine for your table” (z rozbiciem na dania i propozycją kieliszków, gdy dania się „gryzą”); widok kelnera `#/r/halka/staff`.

**Sommelier / restauracja** (`#/admin`): dashboard KPI → menu → edycja dania z suwakami profilu i podglądem dopasowań na żywo → karta win (szybkie włączanie / wyłączanie) → edycja wina → zarządzanie pairingami (Primary / Alternative / Best value, kolejność, notatki, dodawanie, odrzucanie) → kolejka review → import menu i karty win (CSV parsowany naprawdę; dla PDF / Excel mockup podstawia plik przykładowy) → checklista onboardingu → publikacja → QR (pobieranie SVG / PNG, druk stojaka).

Zmiany w panelu są natychmiast widoczne w aplikacji gościa (stan trzymany w `localStorage`). „Reset demo data” w *Setup checklist* przywraca dane początkowe.

**Stany ekranów:** ekrany list przyjmują `?demo=loading`, `?demo=empty`, `?demo=error`, np. `#/r/halka/dish/d_duck/wines?demo=loading`, `#/admin?demo=empty`.

## Decyzje projektowe

- **Sommelier ponad modelem.** Etykieta „Sommelier recommendation” pojawia się tylko przy parach zatwierdzonych przez sommeliera. Wyświetlany procent to zawsze uczciwy wynik silnika; zatwierdzenie zmienia kolejność, nie liczbę.
- **Bez „AI” w interfejsie.** Komunikaty: „Perfect with your dish”, „Best match”, „Recommended for your table”, „Sommelier recommendation”.
- **Trzy dotknięcia** od skanu do listy win, bez rejestracji.
- **Wygląd:** chłodny jasny papier, atrament z nutą bakłażana, głębokie bordo jako kolor marki, mosiądz tylko dla pieczęci sommeliera; Bodoni Moda (skojarzenie z etykietą wina) dla nazw dań i win, Hanken Grotesk dla interfejsu. Jeden wyrazisty element: „Match glass” — kieliszek wypełniony kolorem danego wina do poziomu dopasowania.

## Ograniczenia mockupu

- Brak backendu: stan w przeglądarce (`localStorage`), API opisane w dokumentacji.
- Import PDF / Excel jest symulowany (podstawia plik przykładowy); CSV jest parsowany naprawdę.
- Dane dashboardu są demonstracyjne.
- Widok kelnera i aplikacja gościa dzielą preferencje w tej samej przeglądarce.
