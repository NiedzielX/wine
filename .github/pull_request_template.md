## Cel zmiany
<!-- Jedno zdanie. Cały diff ma prowadzić do tego celu (bez przy okazji zmienionych nazw i formatowania). -->

## Specyfikacja / log
<!-- .ai/specs/..., .ai/runs/... -->

## Weryfikacja
<!-- Polecenia i wyniki. Minimum: `npm run lint`, `typecheck`, `test`, `build`; przy zmianach bazy `test:db`; przy zmianach tras lub stron `smoke` (memory i postgres). -->

## Struktura i konwencje (`.ai/docs/engineering-standards.md` §8)
- [ ] Folder pojęcia zgodny z konwencją; encja i serwis występują parami
- [ ] Żaden import nie łamie kierunku zależności ani nie sięga do wnętrza innego pojęcia
- [ ] Nowa trasa: `handle()` / `handlePublic()` + `parseBody()`, bez własnego `try/catch`
- [ ] Wejście ma schemat Zod (`strictObject`) i test odrzucenia nieznanych pól
- [ ] Stany pusty / błąd / ładowanie z `@wine-match/ui`; bespoke zamiast wspólnego komponentu ma uzasadnienie poniżej

## Bezpieczeństwo (blokujące)
- [ ] Autoryzacja po stronie serwera na każdej niepublicznej trasie
- [ ] Sprawdzana jest konkretna restauracja i rekord, nie tylko „zalogowany”
- [ ] Sprawdź-i-zapisz na współdzielonym zasobie: transakcja i/lub ograniczenie unikalności
- [ ] Żaden sekret, token, hasło ani skrót w logu, odpowiedzi błędu ani u klienta
- [ ] Nic nieufnego w zapytaniu, poleceniu ani ścieżce pliku bez parametryzacji
- [ ] Zapis przez schemat Zod, nigdy `em.create(...req.body)`
- [ ] Flagi ciasteczka zachowane (httpOnly, Secure, SameSite)
- [ ] Błąd w decyzji bezpieczeństwa kończy się odmową
- [ ] Poprawka błędu bezpieczeństwa ma test regresji, który pada bez poprawki
- [ ] Zmiana dotykająca logowania ma kontrolę brute force

## Poprawność
- [ ] Ścieżki współbieżne mają test integracyjny z dwiema sesjami
- [ ] Zmiana zachowania ma test, który pada na starym kodzie
- [ ] Zachowanie zależne od buildu produkcyjnego sprawdzone na `npm run build` + `npm run smoke`
- [ ] Zaktualizowano `docs/` i, jeśli trzeba, `.ai/`

## Odstępstwa od standardów (z uzasadnieniem)
<!-- Pusto, jeśli brak. -->
