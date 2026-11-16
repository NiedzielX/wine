---
status: draft
created: 2026-11-16
owner: Filip
related: [.ai/specs/2026-11-04-sales-demo-and-roi-calculator.md, .ai/specs/2026-11-15-vercel-hosting.md, docs/DEPLOYMENT.md, .ai/runs/2026-11-16-interactive-demo-entry-spec.md]
superseded_by:
---

# Łatwe wejście do interaktywnego dema (konta demo i start funkcji)

## Problem
Instancja demo na Vercelu (`DATA_SOURCE=memory`, `ALLOW_DEMO_DATA=true`) ma działające konta demo z publicznym hasłem (`packages/core/src/demo/users.ts`: Wine Director, General Manager, kelner), ale wejście do nich wymaga znajomości adresu `/admin/login`, e-maili i hasła. Właściciel potrzebuje, żeby demo było łatwo otworzyć od strony administratora i pozostałych funkcji (gość, widok kelnera, QR, kalkulator). Istniejący tryb `SHOWCASE_MODE=demo` (spec `2026-11-04-sales-demo-and-roi-calculator`) jest celowo tylko do odczytu i bez logowania (R9, `/demo`), więc tego nie załatwia.

## Cel i zakres
Tylko na instancji z `ALLOW_DEMO_DATA=true` i bez `SHOWCASE_MODE=demo`: karta „Konta demo” na stronie logowania panelu z przyciskami „Zaloguj jako …” oraz strona startowa z odnośnikami do funkcji. Bez zmian dla produkcji i dla trybu `demo`.

**Poza zakresem:** zmiana trybu `SHOWCASE_MODE=demo`; trwałość zapisów w trybie pamięci (patrz Q2); nowe konta, nowe role, zmiana hasła demo; automatyczne logowanie bez kliknięcia.

## Wymagania
- **R1 Karta kont demo.** Na `/admin/login`, tylko gdy `ALLOW_DEMO_DATA=true` i `SHOWCASE_MODE` ≠ `demo`: lista kont z `DEMO_USERS` (nazwa, rola, e-mail) i przycisk „Zaloguj jako …” (formularz POST z tym samym działaniem co zwykłe logowanie, z publicznym hasłem demo). Bez obejścia uwierzytelniania: zwykła akcja logowania, blokada konta i dziennik jak dziś.
- **R2 Strona startowa.** Trasa tylko dla tej konfiguracji (np. `/start`; Q1) z odnośnikami: widok gościa (`/r/halka`), „cały stół”, widok kelnera (`/r/halka/staff`), panel (logowanie jako GM i jako Wine Director), QR, oraz kalkulator `/demo/roi` jeśli `SHOWCASE_MODE=calculator`. PL i EN, bez słowa „AI” (N02).
- **R3 Bezpieczeństwo.** Karta i strona startowa nie renderują się, gdy `ALLOW_DEMO_DATA` ≠ `true` (produkcja: zawodzi zamykająco i tak, `docs/DEPLOYMENT.md` §4) ani gdy `SHOWCASE_MODE=demo`; nie ujawniają niczego poza stałymi z `DEMO_USERS` i `DEMO_PASSWORD`, które i tak są publiczne. Test dla każdej konfiguracji (produkcja bez demo, demo z kontami, tryb `demo`, `calculator`).
- **R4 Czytelne ostrzeżenie.** Na karcie zdanie, że to dane demonstracyjne i że zmiany mogą zniknąć (zapisy w pamięci są per instancja funkcji; Q2).
- **R5 Dokumentacja.** `docs/DEPLOYMENT.md` §17 (instancja demo) i `docs/SCREEN_SPECIFICATION.md` (A-ekran logowania, nowa strona) zaktualizowane; scenariusz QA i e2e (`check:qa`); wpis w `CHANGELOG.md`.

## Kryteria akceptacji
- [ ] AC1 (R1) Na instancji demo `/admin/login` pokazuje kartę z trzema kontami; kliknięcie „Zaloguj jako” GM prowadzi do panelu jako `tomasz@halka.pl`; błędne hasło w zwykłym formularzu nadal odmawia i liczy próby.
- [ ] AC2 (R2) `/start` zawiera linki do wszystkich ekranów z R2 i wszystkie zwracają 200 na danych demo; PL i EN; HTML bez `\bAI\b`.
- [ ] AC3 (R3) Test SSR: przy `ALLOW_DEMO_DATA` ≠ `true` karta nie istnieje w HTML, `/start` zwraca 404; przy `SHOWCASE_MODE=demo` to samo; hasło demo nie pojawia się w HTML poza konfiguracją demo.
- [ ] AC4 (R4) Zdanie ostrzegawcze jest na karcie w PL i EN.
- [ ] AC5 (R5) Dokumenty i scenariusz QA; `lint`, `typecheck`, `test`, `build`, `check:context`, `check:qa`, CI zielone.

## Projekt rozwiązania
Pliki: `packages/app/src/app/(admin)/admin/login/page.tsx` (karta), nowa trasa `start` w grupie `(guest)` albo `(showcase)` (Q1), `packages/app/src/server/` (jedna funkcja „czy to interaktywne demo” z `env()`), słowniki `en.ts`/`pl.ts`, testy w `packages/app/tests/unit`, `.ai/qa/`, `docs/`. Bez zmian w `core` poza ewentualnym eksportem listy kont demo do odczytu.

## Ryzyka i otwarte pytania (rekomendacje; czekam na akceptację)
- **Q1 Gdzie strona startowa.** Rekomendacja: `/start` w grupie `(showcase)` (ten sam układ co `/demo`), tylko w tej konfiguracji.
- **Q2 Trwałość.** W trybie pamięci każda instancja funkcji ma własny stan, więc publikacja, import i edycje w panelu znikają po recyklingu instancji i rozjeżdżają się między instancjami. Rekomendacja: pełne demo „do klikania” powinno działać na osobnej bazie demo (zarządzany PostgreSQL, `db:migrate` i `db:seed` z `ALLOW_DEMO_DATA=true`, nigdy baza produkcyjna); karta z R1 działa w obu trybach. To ta sama baza, której i tak wymaga produkcja (specyfikacja Vercela), więc robimy ją razem z F0 z bazą.
- **Q3 Publiczny czy chroniony.** Konta demo mają publiczne hasło: każdy, kto zna adres, wejdzie do panelu i będzie mógł zmieniać dane demo. Rekomendacja: Deployment Protection dla adresów roboczych, a publiczny adres do pokazów tylko na osobnym projekcie z danymi tylko do odczytu (`SHOWCASE_MODE=demo`), czyli dwa projekty: interaktywny (chroniony) i pokazowy (publiczny).
- **Ryzyko:** karta z hasłem na publicznej instancji z prawdziwymi danymi. Łagodzenie: R3 (wymaga `ALLOW_DEMO_DATA=true`, a produkcja nie wystartuje z nim), test AC3.
- **Przegląd niezależny** (AGENTS.md §3) jeszcze nie wykonany: przed `approved` zleci go agent nadrzędny.

## Realizacja
(Uzupełnia agent po implementacji.)
