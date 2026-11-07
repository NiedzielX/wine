# Listy kontrolne review: soczewka ogólna i przejścia specjalistyczne

Źródło: lekcja 17 kursu. Używa ich `npm run review:pack` (wkleja listę ogólną i przejścia wywołane zmienionymi ścieżkami do paczki recenzenta; plik jest czytany z gałęzi bazowej, nie z PR-a). Protokół: `.ai/docs/review-protocol.md`. Uzupełnia `CODE_REVIEW.md` (kontrole specyficzne dla repo) i `.ai/docs/engineering-standards.md` §8, nie zastępuje ich.

**Przejścia specjalistyczne to dodatkowe przebiegi w świeżym kontekście** (jeden pod-agent na przejście), uruchamiane na większych lub ryzykowniejszych PR-ach; nie dokładaj ich do jednego, długiego review (wąska soczewka w czystym kontekście znajduje więcej niż szeroka w zatłoczonym). Przy `risk-high` wymagane są co najmniej dwa niezależne review w świeżym kontekście (protokół §2). Każda lista jest krótka i deterministyczna: odpowiedź to „tak / nie / nie dotyczy” z numerem linii diffu, nie ocena ogólna.

<!-- checklist:general -->
- [ ] Diff robi to, czego wymaga spec (jeśli podpięty); nic poza zakresem (obce pliki, formatowanie całych plików, zmiany konfiguracji).
- [ ] Stany pusty, błędu, brak uprawnień i dane graniczne (limit, o jeden za dużo, ponowne wysłanie) mają obsługę i test.
- [ ] Każda zmiana zachowania ma test, który padałby na starym kodzie; poprawka błędu ma reprodukcję.
- [ ] Granice pakietów i reguły `AGENTS.md` §1.2–§1.6, §7 zachowane; brak `console.*`, `any`, własnego `try/catch` w trasie, `instanceof` na błędzie domenowym.
- [ ] Brak sekretów, tokenów i danych osobowych w kodzie, logach, odpowiedziach, fixture'ach.
- [ ] Nowe zależności: wydanie starsze niż 14 dni, wersja przypięta, uzasadnienie w specyfikacji.
- [ ] Dokumentacja (`docs/`, spec, lekcja) zaktualizowana razem z kodem.
- [ ] Czerwone CI lub konflikt z `main` to ustalenie w raporcie, nie powód, żeby przerwać review.

<!-- checklist:authz -->
Reguła trzech sprawdzeń: `.ai/docs/engineering-standards.md` §10 (granica dostępu ma test HTTP na prawdziwej instancji; szablon `packages/app/tests/e2e/access-boundaries.e2e.test.ts`). Mapa granic: `docs/security/threat-model.md`. Sprawdź diff względem czterech elementów §10:
- [ ] **1. Kontrola pozytywna dla OBU kont:** to samo wywołanie, które ma być odmówione, działa dla właściciela danych (200), w obie strony (A→B i B→A); bez tego 404 może znaczyć „zepsute wywołanie”.
- [ ] **2. Odmowa odczytu:** obce konto dostaje 403 (obcy slug) albo 404 (cudze id pod własnym slugiem), a ciało nie zawiera żadnej wartości z cudzych danych.
- [ ] **3. Odmowa zapisu:** każda metoda zapisu z cudzym id lub za wysoką rolą kończy się 403/404/422, nigdy 2xx; pola spoza schematu odrzucone (`strictObject`).
- [ ] **4. Stan po próbie:** porównane całe ładunki przed i po oraz skrót wierszy dotkniętych tabel, nie liczniki; mutacja (usunięty filtr `restaurant`, wymuszona rola) wykazuje, że test pada.
- [ ] Drzwi: wejście (`requireAccess`, `authorizeAction`, `handle()`) samo sprawdza zalogowanie i uprawnienie z `permissions.ts`; błąd w sprawdzeniu kończy się odmową; każda metoda repozytorium przyjmuje `restaurantId` (wyjątki: `AGENTS.md` §1.3).
- [ ] Nowa trasa z id w ścieżce, nowa rola lub publiczne wejście ma wiersz w `docs/security/threat-model.md` w tym samym PR.
- [ ] Zapis wymaga CSRF (`X-CSRF-Token` / kontrola Origin); sesja i ciasteczka bez zmian flag.
- [ ] Zmiana tabeli uprawnień lub kodu sesji i haseł to `risk-high`: druga osoba, bez self-QA, zaktualizowany `threat-model.md` (`parallel-work.md` §1.11).

<!-- checklist:nextjs -->
- [ ] Komponent serwerowy domyślnie; `'use client'` tylko przy interakcji i bez importów z `app/src/server`; do komponentu klienckiego nie trafiają funkcje ani niepotrzebne dane (serializowalne propsy).
- [ ] Dane pobierane na serwerze przez serwisy z kontenera DI; brak pobierania w efekcie, gdy da się na serwerze; brak waterfalli (niezależne zapytania równolegle).
- [ ] Nic tajnego w kliencie: zmienne bez `NEXT_PUBLIC_`, brak sekretów i danych innych restauracji w propsach.
- [ ] Rozmiar paczki: brak ciężkich bibliotek w kliencie, brak CDN i `next/font/google`.
- [ ] Dostępność: etykiety pól, kontrast, obsługa klawiaturą, `lang`, rozsądna semantyka; strony gościa działają bez JavaScriptu (filtry jako linki).
- [ ] Stany pusty, błąd, ładowanie przez `EmptyState`, `ErrorMessage`, `LoadingMessage`; 390 px i 1440 px bez poziomego przewijania.
- [ ] Po zapisie `revalidatePath` obejmuje layout, jeśli go dotyczy (lekcja `server-action-layout-revalidate`).

<!-- checklist:database -->
- [ ] Encja zmieniona razem z nową migracją (z `up` i `down`); zastosowana migracja nie jest edytowana; `schema:check` zgodny.
- [ ] Plan wycofania opisany: co się dzieje z danymi po `down`, czy da się wrócić po wdrożeniu kodu.
- [ ] Blokady: `ALTER`/indeks na dużej tabeli nie blokuje zapisu dłużej niż chwilę (indeks współbieżny, dodanie kolumny nullable zamiast `NOT NULL` z domyślną na całej tabeli, podział na kroki).
- [ ] Backfill: osobny, wznawialny krok, idempotentny, w partiach; nowy kod działa przed i po backfillu.
- [ ] Ograniczenia unikalności i klucze obce zamiast samego sprawdzenia w kodzie; sprawdź-i-zapisz w transakcji lub z `FOR UPDATE`.
- [ ] Nowa metoda portu: przypadek w `repositoryContract` i obie implementacje (pamięć, PostgreSQL); test na PostgreSQL (`test:db`).
- [ ] Identyfikatory z URL-a nie trafiają do kolumny `uuid` bez walidacji (lekcja `url-ids-vs-uuid-columns`).

<!-- checklist:api -->
- [ ] Kształt błędów jak w `docs/API_SPECIFICATION.md`; nowy kod błędu domenowego ma status w `fromDomainError` i na liście dozwolonych (lekcja `new-domain-errors-need-the-app-allowlist`).
- [ ] Polityka 403 vs 404 spójna z sąsiednimi trasami: cudzy zasób nie zdradza swojego istnienia tam, gdzie reszta API tego nie robi.
- [ ] Identyfikatory i parametry walidowane (UUID lub schemat), `strictObject`, nieznane pole to 422; brak `em.create(...req.body)`.
- [ ] Zgodność wsteczna (`BACKWARD_COMPATIBILITY.md`): nie usunięto ani nie zmieniono pola, kodu, trasy; strona konsumująca sprawdzona.
- [ ] `If-Match` / `expectedVersion` tam, gdzie wymagane; idempotencja ponowienia.
- [ ] Dokumentacja API i `scripts/smoke.mjs` zaktualizowane.

<!-- checklist:tests -->
- [ ] Dowód „czerwony przed, zielony po”: wynik `npm run verify:regression` (poprawki) albo test, który wyraźnie pada na starym kodzie.
- [ ] Asercje na treść i skutek (zawartość odpowiedzi, stan w magazynie, brak wycieku), nie tylko na status 200.
- [ ] Kontrola dodatnia: test pokazuje, że warunek, który ma zadziałać, naprawdę działa (a nie że nic się nie dzieje, bo dane puste).
- [ ] Myślenie mutacyjne: zepsuj w głowie jedną linię poprawki (zmień `>` na `>=`, usuń warunek, pomiń `restaurantId`); czy któryś test by spadł? Jeśli nie, test jest za słaby.
- [ ] Deterministyczność: bez losowości, zegara, kolejności zależnej od środowiska; losowe identyfikatory zamiast ręcznie dobranych wartości (lekcja `hand-picked-values-vs-random-ids`).
- [ ] Test w katalogu `tests/` pakietu; zmiana zachowania w UI/API ma e2e i scenariusz `.ai/qa` (`check:qa`).
- [ ] Nic nie jest skasowane, osłabione ani pominięte (`skip`, `only`, rozluźnione asercje) bez uzasadnienia.

<!-- checklist:observability -->
- [ ] Trasa ma etykietę (route label) w metrykach i logu przez `handle()`; nowa trasa nie tworzy etykiety o nieograniczonej liczbie wartości (id w etykiecie).
- [ ] Logi tylko przez `logger`; bez PII (e-mail, imię, token, ciasteczko, skrót hasła, treść zaproszenia) i bez całych obiektów żądania; błąd niedomenowy bez treści użytkownika.
- [ ] Błędy nie są połykane (`catch` bez śladu); porażka ma log o poziomie adekwatnym do skutku.
- [ ] Nowa ścieżka krytyczna (pieniądze, uprawnienia, import, kopie) zostawia ślad audytowy lub metrykę.
- [ ] Ruch własny (smoke) oznaczony nagłówkiem syntetycznym, żeby nie zaśmiecał telemetrii.

<!-- checklist:docs -->
- [ ] Zmiana ekranu, API, modelu danych lub silnika ma aktualizację w `docs/` w tym samym PR.
- [ ] Spec: status zgodny z cyklem (`AGENTS.md` §3), `approved` tylko od człowieka, po wdrożeniu `implemented` + „Realizacja” + przeniesienie; kryteria akceptacji odhaczone tylko za dowodem.
- [ ] Lekcja zapisana, gdy przyczyna nie była oczywista; indeks `.ai/lessons.md` ma linię na górze.
- [ ] Log przebiegu w `.ai/runs/` z uruchomionymi poleceniami i wynikami; nazwy plików w `.ai/` zgodne z konwencją; `npm run check:context` przechodzi.
- [ ] Opis w dokumencie zgadza się z kodem (liczby, nazwy poleceń, ścieżki).
