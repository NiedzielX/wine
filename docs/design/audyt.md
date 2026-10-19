# Audyt generycznego wyglądu (lekcja 06, ćwiczenie 1)

Data: 2026-10-19. Zakres: aplikacja gościa (`packages/app/src/app/(guest)`), panel (`packages/app/src/app/(admin)`, `packages/ui/src`). Metoda: ręczny przegląd kodu i zrzutów, wzorce z listy lekcji, `scripts/check-design.mjs`. Przeglądarki nie użyto w tym przebiegu; kontrast liczony z tokenów. Wykrywacz jako agent (prompt z lekcji) nie był jeszcze uruchomiony na tym raporcie.

## 1. Znaki generycznego wyglądu

| Znak | Gość | Panel | Uwagi |
|---|---|---|---|
| indygo lub fiolet jako akcja | nie | nie | akcja to bordo `wine` |
| gradient w nagłówku | nie | nie | gradient tylko jako wygaszenie pod dolnym paskiem (funkcja, nie ozdoba) |
| karty z cieniem jako jedyny podział | nie | nie | gość: płaskie powierzchnie z linią 1 px; cień tylko arkusz filtrów (nakładka) |
| pigułka nad nagłówkiem | nie | nie | |
| wyróżnione kolorem słowo w nagłówku | nie | nie | |
| rząd wielkich liczb | nie | nie | |
| wymyślone liczby, opinie, oceny | nie | nie | sprawdzone grepem po tekstach (`4,9`, `opinii`, `klientów`) |
| emoji zamiast ikon | nie | tak, naprawione | `✓` i `!` na Ustawieniach i Publikacji zamienione na `StatusIcon` (PR #81) |
| pigułki na większości elementów | częściowo | nie | chipy i przyciski gościa są pigułkami (`rounded-full`, 29 miejsc). Świadoma decyzja, do rozważenia |

## 2. Błędy UX i dostępności

| Problem | Gdzie | Status |
|---|---|---|
| tekst pomocniczy `ink-3` poniżej 4,5:1 (3,73:1) | cały gość, 13 miejsc | naprawione: `#6f646a`, 5,1:1 |
| obramowania chipów i przycisków poniżej 3:1 (1,57:1 na białym) | chipy, przyciski, pola | naprawione: token `control` `#8c8087`, 3,8:1 (WCAG 1.4.11) |
| menu bez dań: pusty formularz i przycisk, który nic nie zwraca | G5 (stolik) | naprawione: komunikat jak na G1 (PR #82, do sprawdzenia) |
| fokus i kontrast przycisku „Indigo” z lekcji | n/d | nie dotyczy, bo kolor marki |
| stany ładowania, pusto, błąd | wszystkie ekrany gościa | sprawdzone grepem: pusto i błąd są na ekranach z listami i wynikami; zostaje G5 (PR #82) |
| linie tekstu dłuższe niż 75 znaków | G3, G7, G12 | nie zmierzone w przeglądarce. Do sprawdzenia przy 1440 px |
| komunikaty błędów bez wskazówki | formularze panelu | przegląd: pola z komunikatem co zrobić (np. „podaj cenę w złotych”); bez zmian w tym przebiegu |

## 3. Rozrzut wartości (liczby unikalne)

| Miara | Przed | Po |
|---|---|---|
| kolory hex poza tokenami (gość) | 21 | 1 (theme-color w `layout.tsx`, wymagany literał) |
| rozmiary tekstu na ekranach gościa | 27 | 7 (`text-caption` … `text-display`) |
| promienie zaokrąglenia | 11 | 4 |
| kontrast tekstów gościa < 4,5:1 | 1 (`ink-3`) | 0 |
| kontrast tekstów panelu < 4,5:1 (jasny i ciemny motyw) | nie sprawdzano | 0 (`check:design`) |

## 4. Pięć decyzji, które zamykają ten raport

1. **Tokeny kontrolek** (zasada): każda granica interaktywna ma kolor `control` z kontrastem ≥ 3:1. Token, nie literał.
2. **Siedem stylów tekstu** (token): `text-caption`, `text-small`, `text-body`, `text-lead`, `text-h2`, `text-h1`, `text-display`.
3. **Cztery promienie** (token): `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`.
4. **Jeden zestaw ikon w panelu** (zasada): Lucide, także znaczniki statusu (`StatusIcon`).
5. **Strażnik w CI** (zasada): `check:design` blokuje nowe literały, nowe rozmiary, kontrast poniżej 4,5:1 i cienie/emoji na ekranach gościa.

## 5. Otwarte

- Pigułki jako świadoma decyzja (sekcja 1): zostają, do przeglądu przez człowieka.
- Wykrywacz jako agent na tym samym raporcie: do zrobienia w kolejnym przebiegu, nie blokuje tego PR.
- Ciemny motyw gościa: poza zakresem (decyzja właściciela).
