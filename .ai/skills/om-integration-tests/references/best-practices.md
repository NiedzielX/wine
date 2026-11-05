# Dobre praktyki testów integracyjnych (end to end) w Wine Match

Źródło: lekcja 12 kursu (lista „Dobre praktyki testów integracyjnych”) z dopiskami z tego projektu. Stosuje je lokalne rozszerzenie skilla `om-integration-tests` (`../SKILL.md`). Test, który łamie regułę, jest błędem, nawet jeśli przechodzi.

Testy integracyjne chronią przed regresją widoczną dla użytkownika. Powinny dawać ten sam wynik przy każdym uruchomieniu, lokalnie i w CI. Niestabilny test (flaky) jest gorszy niż brak testu, bo nikt mu nie ufa.

## Zasady

| # | Zasada | Jak to zrobić w praktyce |
|---|---|---|
| 1 | Sprawdzaj efekt, który ma znaczenie | Gość widzi kod dla kelnera? Kelner oznacza zamówienie i status się zmienia? Samo wywołanie funkcji nie dowodzi, że działa. Testuj zachowanie systemu, nie szczegóły implementacji (od tego są testy jednostkowe). |
| 2 | Jeden test, jeden przypadek | Jeden scenariusz to jeden przypadek biznesowy z jasnym celem. Oznaczenie, cofnięcie i błędny kod to trzy scenariusze. |
| 3 | Punkt startowy, akcja, wynik | Given, When, Then. W teście i w scenariuszu Markdown widać, co jest warunkiem początkowym, co robi użytkownik i co ma się stać. |
| 4 | Nie licz do pięciu | Zamiast `wait(5000)` czekaj na konkretny stan (widoczny element, odpowiedź HTTP ze statusem). Kontroluj czas i losowość; żadnych stałych dat (`do 11 kwietnia`) ani zależności od wolnej aplikacji. |
| 5 | Test jest samodzielny | Sam przygotowuje dane i po sobie sprząta. Nie zakłada, że poprzedni test coś utworzył albo zmienił. Nie dzieli danych z innymi testami. |
| 6 | Przygotuj dane najkrótszą drogą | Stan początkowy zakładaj przez API albo seeder (nowa restauracja z `restaurant:create`, kod wydany serwisem), a pełną ścieżkę klikaj tylko wtedy, gdy ona jest celem testu. |
| 7 | Sprawdzaj wynik tam, gdzie trzeba | Czasem wystarczy komunikat w UI, czasem trzeba też sprawdzić bazę, API albo zdarzenie użycia. Wybierz poziom, który potwierdza dany scenariusz. |
| 8 | Kontroluj usługi zewnętrzne | Mock albo środowisko testowe dostawcy (płatności, poczta); sprawdź treść wysyłanego żądania. Własne komponenty, których współpracę testujesz, zostaw prawdziwe. Logowanie w testach idzie przez wspólne mockowane konta, nie przez prawdziwych dostawców. |
| 9 | Sprawdź też, kiedy coś idzie nie tak | Poprawna ścieżka to początek. Dodaj błędne dane, brak uprawnień, obcą restaurację, wczorajszy kod, wartości graniczne. |
| 10 | Wyślij to samo drugi raz | Powtórzone żądanie lub formularz nie tworzy drugiego rekordu ani nie liczy zdarzenia dwa razy (idempotencja). |
| 11 | Szukaj po znaczeniu, nie po wyglądzie | Rola i nazwa (`button` „Cofnij”), etykieta pola, w razie potrzeby `data-testid`. Żadnych selektorów względnych ani zależnych od układu. |
| 12 | Powiedz dokładnie, czego oczekujesz | Konkretny status, kwota, komunikat, struktura odpowiedzi. „Odpowiedź jest OK” albo „nie jest null” to za mało. |
| 13 | Nie chowaj scenariusza w helperach | Małe funkcje pomocnicze są dobre, ale po przeczytaniu testu ma być jasne, co zrobił użytkownik. |
| 14 | Nazwij test tak, żeby było wiadomo, co padło | „Odrzuca oznaczenie kodu z wczoraj” zamiast „test kodu 3”. Tytuł `it` jest kluczem scenariusza w `.ai/qa`, więc ma być jednoznaczny i stały. |
| 15 | Przejrzyj to, co napisało AI | Scenariusz i oczekiwany wynik muszą wynikać ze specyfikacji. Przeczytaj test, sprawdź go ręcznie na działającym środowisku. Zielony check to nie wszystko. |

## Dodatki z tego projektu

- **Losowe identyfikatory a wartości wpisane na sztywno.** Kod polecenia powstaje z losowego UUID. Test, który sprawdza „brak” albo „inny” przez literał (`H8H`), nie może dzielić przestrzeni wartości z generatorem. Wstrzyknij generator omijający literały albo wygeneruj wartość i sprawdź, że nie istnieje (lekcja `2026-11-05-hand-picked-values-vs-random-ids`).
- **Czas.** Dzień serwisowy liczy `serviceDay` (Europe/Warsaw, granica 04:00). Test, który zależy od „dziś” lub „wczoraj”, ustawia czas jawnie albo liczy daty z jednego `serviceDay`, i nie zakłada pory dnia ani zmiany czasu.
- **Strony gościa działają bez JavaScriptu**, a stan gościa jest tylko w URL. Test ścieżki gościa przechodzi ją linkami i formularzami GET, bez założeń o cookies.
- **Silnik jest deterministyczny.** Asercje o wynikach silnika sprawdzają relacje (A przed B, wynik ≥ próg), a nie kruche liczby, chyba że test jest testem złotym.
- **Dane demo Halki** są stałe, ale test, który je zmienia, przywraca je albo pracuje na własnej restauracji.

## Zakres pokrycia

Każdy scenariusz ma plik w `.ai/qa/{AREA}/` (zob. `.ai/qa/README.md`) i kod testu w `packages/app/tests/e2e/`. Nowa funkcja z kryteriami akceptacji dostaje scenariusze dla swoich AC, w tym co najmniej jeden niestandardowy (negatywny, graniczny albo idempotentny).
