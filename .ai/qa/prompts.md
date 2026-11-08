# Gotowe prompty QA

Fragmenty do wklejenia (zlecenie jednorazowe, warstwa 3 z `.ai/docs/qa-protocol.md` §5). Powtarzasz któryś drugi raz: przenieś go wyżej (skill lub dokument). Podstaw `N`, nie dopisuj własnych wniosków o PR: opis PR to twierdzenia, nie fakty.

## 1. Rozpocznij sesję QA dla PR N

```
Zrób sesję QA dla PR N według .ai/docs/qa-protocol.md. Czytaj diff i kryteria akceptacji ze specyfikacji, nie opis PR.
Najpierw: akapit "co zobaczy użytkownik" i plan z kolumną "wyrocznia" (bez wyroczni nie ma przypadku). Dopiero potem środowisko
(cel bazy host:port/nazwa, brak cienia DATABASE_URL, logowanie kontem z seedu i prawdziwe dane), potem wykonanie w prawdziwej
przeglądarce (390 i 1440 px, PL i EN, role istotne dla zmiany). Przy każdym przypadku: etykieta metody, konsola i sieć, zrzut
który obejrzysz. Błędy według .ai/qa/bug-template.md. Potem niezależny weryfikator w świeżym kontekście: dostaje kroki i
oczekiwane wyniki, nie Twoje rozumowanie. Limit czasu: 45 minut. Nie zmieniaj etykiet, nie publikuj komentarza: przygotuj
szkic raportu z sekcją "Wymaga ludzkiego oka" i dopisz wpis w .ai/qa/knowledge/ (także przy zerze błędów).
```

## 2. Uszereguj kolejkę `needs-qa`

```
Wylistuj otwarte PR z etykietą needs-qa (gh pr list --label needs-qa) i uszereguj je: priorytet (priority-*), ryzyko (risk-*),
czas oczekiwania (od ostatniego pusha albo od nałożenia etykiety), a także czy etykieta qa-approved jest aktualna dla głowy
(linia "QA head: <sha>"). Dla każdego PR jedno zdanie uzasadnienia, jaką ścieżkę dostaje (pełną z weryfikatorem, skróconą, brak
QA) i dlaczego. Nie zakładaj, że wszystkie wymagają QA: pominięcia z powodem (tylko docs/testy). Wynik: tabela, nic nie zmieniaj.
```

## 3. Przeanalizuj specyfikację jak tester

```
Przeczytaj specyfikację <ścieżka w .ai/specs/> jak tester. Zapisz jako samodzielny plik HTML (czytelny na telefonie):
1. ryzyka (gdzie agenci mylą się najczęściej: puste stany, granice, pieniądze, czas, uprawnienia i restaurantId, ponowne wysłanie, id spoza UUID),
2. scenariusze według priorytetu P0-P2, każdy z wyrocznią (AC, linia docs),
3. karta testu (charter): misja, obszar, czas, na co patrzeć,
4. niejednoznaczności specyfikacji: pytania, które trzeba rozstrzygnąć przed kodem, z propozycją domyślnej odpowiedzi.
Nic nie klikaj i niczego nie zmieniaj w repozytorium.
```

## 4. Potwierdź środowisko

```
Zanim zaczniemy testować, potwierdź środowisko i niczego nie zmieniaj: (a) wypisz commit i gałąź, (b) cel bazy jako host:port/nazwa
(nigdy hasło ani pełny DATABASE_URL), (c) czy DATABASE_URL w procesie różni się od .env (nie czytaj .env: polecenia operatora
same ostrzegają "WARNING: DATABASE_URL in the process environment differs from .env"; jeśli tak, przerwij), (d) DATA_SOURCE,
(e) zaloguj się kontem z seedu i opisz jedno prawdziwe dane, które widzisz (np. liczbę dań menu). Jeśli którykolwiek punkt budzi
wątpliwość, zatrzymaj się i napisz który.
```

## 5. Zasiej dane (prawdziwe, opisane polecenia)

```
Przygotuj dane do testów wyłącznie udokumentowanymi poleceniami z .ai/docs/commands.md:
- całe środowisko jednorazowe: npm run test-env:up (świeża baza z migracjami, restauracja halka z kontami demo, druga restauracja
  bistro-e2e; hasła z gitignorowanego .ai/qa/test-env.env, nie przepisuj ich);
- albo na istniejącej, WŁASNEJ lokalnej bazie: npm run db:migrate, potem npm run db:seed (dane demo; strażnik odmawia na chronionym
  NODE_ENV bez ALLOW_DEMO_DATA=true i nigdy nie sieje prawdziwej instalacji);
- dodatkowa restauracja: USER_PASSWORD=… npm run restaurant:create -- --name … --slug … (dane testowe), konto: npm run user:create,
  zaproszenie: npm run user:invite -- --restaurant … --email … --role … --as <e-mail zapraszającego>.
Każde z nich drukuje na stderr cel bazy: sprawdź go przed uznaniem, że polecenie zadziałało na właściwej bazie. Na koniec
npm run test-env:down, jeśli to Ty uruchomiłeś środowisko.
```
