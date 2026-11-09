# Changelog

Format wg [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), po polsku jak README. Wpisy pochodzą z listy scalonych PR-ów (numer w nawiasie). Wersja w `package.json` to `0.2.0`; nic nie jest otagowane, a definicja wersji 1.0 jest decyzją właściciela. Co zrobić przy zmianie niezgodnej wstecz: [UPGRADE_NOTES.md](UPGRADE_NOTES.md); jak powstaje wydanie: [docs/RELEASING.md](docs/RELEASING.md). Kształt sekcji `[Unreleased]` sprawdza `npm run release:notes -- check`.

## [Unreleased]

### Wdrożenie produkcyjne (E11, E11b)
- E11 F1: gotowość pod produkcję: `PUBLIC_BASE_URL` zawodzący zamykająco, `GET /api/v1/health`, strażnik seedera, `smoke --production` (#120). Zmiana łamiąca: w produkcji brak `PUBLIC_BASE_URL` zatrzymuje serwer.
- E11b: domknięcie specyfikacji kodu polecenia (AC1–AC6, AC13–AC15) (#116).
- Zależności: Next 16.4.1 i undici 7.30.1 (#104), zod 4.6.6 (#97).

### Konta i role (E12)
- F1: status członkostwa, dziennik uwierzytelniania, serwis zespołu, ekran A15 (#118).
- F2: zaproszenia (`auth_token`), lista w A15, przyjęcie A17, zarezerwowane slugi (#123); `npm run user:invite` (#125).

### Jakość platformy (E21)
- F1: endpoint metryk, jedna linia logu na żądanie, redakcja sekretów (#117).

### Demo sprzedażowe (E22)
- F1: kalkulator zwrotu, `SHOWCASE_MODE=calculator` (#122).
- F2: przewodnik demo, `SHOWCASE_MODE=demo` tylko do odczytu (#126).

### Bezpieczeństwo, proces i testy
- Model zagrożeń, testy granic dostępu, nagłówki bezpieczeństwa (#127); `check:routes` (#128); protokół review i paczka review (#129); izolacja tenantów i role na PostgreSQL (#112); hook agenta działa przy spacji w ścieżce (#115).
- Reguły pracy równoległej (#108), skrypt dowodu naprawy, CodeQL, Dependabot (#110), scenariusze QA i środowisko testowe (#107), `merge=union` dla indeksów (#119), stan prac i nocny review (#121), plan domknięcia produktu i specyfikacje E12–E22 (#105).
- Poprawki: identyfikator spoza UUID to „nieznany”, nie 500 (#109); flaky test kodu kelnera (#106).
- Proces wydania (lekcja 22): `docs/RELEASING.md`, `UPGRADE_NOTES.md`, §9 w `BACKWARD_COMPATIBILITY.md`, `npm run release:version` i `npm run release:notes`, szkic workflow `release.yml` (tylko ręcznie, bez publikacji pakietów i wdrożenia).

### Analityka, sprzedaż, okazje (E02–E04, E10)
- E02: sesja gościa w URL (`sid`) i zdarzenia odsłon (#61), wybór wina i podgląd kelnera (#63).
- E03: import sprzedaży z POS (#73), Wine Attach Rate (#75); poprawka ograniczenia `covers` (#91).
- E04: KPI użycia (#72), KPI sprzedaży (#87), skuteczność pairingów (#74).
- E10: rdzeń okazji (#58), ekrany okazji (#62), sygnał S4 (#76), sygnał S5 (#69).

### Doświadczenie gościa i kelnera (E07–E09)
- E07: test złoty i `ENGINE_FACTS` (#55), `InfoDisclosure` i etykiety (#57), wyjaśnienia na ekranach gościa i G12 (#66), „Co dalej?” na G8 (#67), wyjaśnienia w panelu (#59).
- E08: silnik stołu `wm-rules-1.1.0` (#56), ekran kelnera G11 (#68), „Cały stół” u gościa (#64), ilość wina `wm-rules-1.2.0` (#70).
- E09: kod polecenia na G8 (#65), kelner oznacza „Zamówione” (#71), dopasowanie kodów w imporcie POS (#88).

### Gość, język, projekt wizualny
- Jedno dotknięcie od QR do win, preferencje, układ desktopowy (#30); pełna szerokość od 768 px (#33); stan pusty G5 (#82); zawijanie nagłówka A7 przy 390 px (#96).
- Wersja polska aplikacji gościa (#31) i panelu (#32); treść restauracji PL i EN (#34).
- System projektowy gościa, tokeny, kontrast, job `design` (#77–#81, #83, #85); Storybook i testy dostępności (#84), job `a11y` (#86).

### Dane i bezpieczeństwo agenta
- Nazwy pozycji POS nie są przechowywane w zadaniu importu (#92).
- E05-S01: `npm run restaurant:create` (#98).
- Utwardzenie warsztatu agenta (#94, #99), `check:context` i AGENTS.md jako router (#100, #101), usunięcie osieroconych skilli (#102).

### Proces i dokumentacja specyfikacji
- Konfiguracja pipeline agentów i warstwa produktowa (#1, #2), brief i backlog badań (#10), backlog techniczny (#27), specyfikacje E02–E05 i ich zatwierdzenie (#28, #29), pozycjonowanie D13–D18 i specyfikacje E07–E10 (#35), odświeżenie discovery (#103), lekcje (#93).

## [0.2.0]

Wersja `0.2.0` jest w `package.json` od pierwszego commitu repozytorium („Import full Wine Match monorepo”, 2026-10-15), który wprowadził cały monorepo naraz. Historia przed tym commitem nie jest w repozytorium, więc **nie da się ustalić**, co ta wersja oznaczała; nie ma tagów ani wcześniejszego wpisu. Z dokumentacji wynika tylko, że w tamtym stanie istniały silnik, mockupy, aplikacja gościa, panel z zapisami, logowanie oraz import i QR (fazy 1–5 planu migracji z mockupów).
