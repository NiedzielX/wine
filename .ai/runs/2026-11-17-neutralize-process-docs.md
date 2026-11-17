---
started: 2026-11-17 09:00
ended: 2026-11-17 10:30
agent: Claude Code
spec: brak — porządkowanie dokumentacji i komentarzy, bez zmiany zachowania aplikacji
outcome: success
related: []
---

# Usunięcie atrybucji do zewnętrznych materiałów szkoleniowych z dokumentacji i komentarzy

## Zadanie

Repozytorium będzie przeglądane w całości przez osoby z zewnątrz, więc ma wyglądać na samodzielny projekt inżynierski. Z plików śledzonych przez git usunąć atrybucję praktyk, dokumentów i specyfikacji do zewnętrznych materiałów szkoleniowych (numerowane odcinki, zadania do wykonania na zajęciach, lokalne ścieżki do materiałów, mapowanie materiałów na repozytorium). Reguły, progi i procedury zostają; mechanizm `.ai/lessons/` + `.ai/lessons.md` (własna pamięć projektu) bez zmian. Nie zmieniać historii gita, nie pushować, nie otwierać PR; nie zmieniać logiki aplikacji.

## Przebieg

- Gałąź `docs/neutralize-process-docs` z `origin/main`; `node_modules` przez `npx -y npm@11.6.2 ci --engine-strict=false` (`package-lock.json` bez zmian).
- Stan wyjściowy `audit:process` zapisany przed zmianami: PASS 46, FAIL 4, PARTIAL 3, MANUAL 10 (JSON porównany po zmianach: te same identyfikatory i statusy).
- Zakres wyszukiwania: wzorzec z zadania plus własne uzupełnienia (odmiany słów o odcinkach, „materiały”, „opracowanie”, nazwa zewnętrznego narzędzia, ścieżki lokalne, nazwy gałęzi w logach). Każde trafienie oceniane ręcznie.
- Commit 1: dokument procesu z nazwą źródła zewnętrznego zastąpiony przez `docs/PROCESS.md` (model operacyjny, mapa praktyk i ich miejsc w repozytorium, rejestr decyzji właściciela, CI i piramida testów, luki i następne kroki; START PROMPT bez zmian). Usunięte: tabela mapowania odcinków, lista wymagań zewnętrznego projektu, zadania szkoleniowe, wzmianki o materiałach i ścieżkach lokalnych. Zaktualizowane odwołania: `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`, `.ai/docs/commands.md`, `.ai/docs/process-playbook.md`, `scripts/process-audit.mjs` (stała dokumentu, komunikaty, mapa kontroli), `packages/testkit/tests/process-audit.test.ts`. Pierwsza wersja `docs/PROCESS.md` miała gołe tokeny katalogów, co dało FAIL w CTX-09; poprawione pełnymi ścieżkami.
- Commit 2: komentarze w `.github/workflows/*.yml`, `.github/dependabot.yml`, skryptach, kodzie, testach i schematach JSON bez numerów odcinków; uzasadnienia zachowane (regex plus ręczna poprawka wielkich liter na początku zdań).
- Commit 3: dokumenty `docs/`, `docs/design/*`, `docs/security/*`, `security-notes.md`, `.ai/docs/*`, `.ai/qa/README.md`, lokalne rozszerzenie skilla testów integracyjnych, `CHANGELOG.md` (wpisy o syntezie i odcinkach przepisane na „playbook wykonawcy i `npm run audit:process`”, „reguły wdrożenia i utrzymania oraz kierunek hostingu”, numery PR bez zmian).
- Commit 4: zmiana nazw siedmiu logów (`git mv`, data bez zmian) i poprawa każdego odwołania (`related`, `source`, ścieżki w logach, lekcjach, specyfikacjach, notatce QA i modelu zagrożeń).
- Commit 5: treść logów przebiegów, lekcji projektu, specyfikacji i audytu utrzymania: tytuły, front matter, proza. Nazwy gałęzi roboczych z dawnych przebiegów zastąpione opisem („gałąź robocza”), bo gałęzie te istnieją tylko lokalnie lub w historii.
- Ślepe uliczki: pierwsza próba złożenia jednego polecenia z `git` i heredoc została odrzucona przez ograniczenia worktree; polecenia rozdzielone. Pierwszy `npm run build` zakończył się komunikatem narzędzia o ostrzeżeniu bezpieczeństwa wersji Next.js (kontrola zaawansowanych komunikatów w rejestrze npm, niezwiązana ze zmianą); powtórzenie tego samego polecenia przeszło.

## Zmienione nazwy plików (stan po zmianie)

- `docs/PROCESS.md` (dawniej dokument procesu z nazwą źródła zewnętrznego)
- `.ai/runs/2026-11-07-security-review.md`
- `.ai/runs/2026-11-07-review-protocol.md`
- `.ai/runs/2026-11-08-qa-protocol.md`
- `.ai/runs/2026-11-09-multi-model-review.md`
- `.ai/runs/2026-11-09-release-management.md`
- `.ai/runs/2026-11-10-process-playbook-audit.md`
- `.ai/runs/2026-11-15-deployment-maintenance-rules.md`

## Weryfikacja

- `npm run lint` 0, `npm run typecheck` 0.
- `npm test` 0 we wszystkich pakietach (core 767, db 126, ui 62, app 579, testkit 675 + 1 pominięty).
- `npm run build` 0 (po jednym powtórzeniu, patrz wyżej).
- `npm run check:context` 0 błędów (12 ostrzeżeń o rozmiarach, tych samych kategorii co na `main`), `check:qa` 0 (123 scenariusze), `check:pages` 0, `check:routes` 0 (25 handlerów), `check:boundaries` 0, `secrets:scan` 0 (22 trafienia, wszystkie na allowliście).
- `npm run audit:process`: PASS 46, FAIL 4, PARTIAL 3, MANUAL 10, czyli tak samo jak przed zmianami; różnica tylko w opisowym polu dowodu CTX-09 (liczba rozwiązanych odwołań 104 zamiast 106, bo nowy dokument ma mniej ścieżek).
- Liczba trafień wzorca z zadania: przed 354 linie w 157 plikach, po 142 linie w 75 plikach.

### Pozostałe trafienia (uzasadnione, bez zmian)

- Słowo o układzie dla dużego ekranu w opisach responsywności, nazwach scenariuszy QA, komentarzach CSS i komponentów, specyfikacjach (większość pozostałych trafień).
- Słowo o pozycji posiłku w specyfikacji menu degustacyjnego i w tablicach nazw kolumn importu (`packages/core/src/import/*`).
- Zwykłe słowo o próbowaniu na danych w `docs/DEPLOYMENT.md` (fragment wzorca w środku wyrazu).
- Odwołania do lekcji własnych projektu po dacie w komentarzach kodu (`scripts/*.mjs`, `scripts/user-invite.ts`, `packages/*`) i specyfikacjach: to mechanizm `.ai/lessons/`, który zostaje.
- Frazy w tekście zewnętrznym skilli (`.agents/skills/**`: nazwa produktu do kontenerów, idiom o przeszkodach) oraz w nazwie hooka (`rekursywne`).
- „Pulpit” w znaczeniu panelu (dashboard) w logu o polskich tłumaczeniach.

### Czego nie zneutralizowano

- `.ai/docs/reference/2026-09-01-devmentor-engineering-standards.md` i odwołania do niego (`.ai/docs/engineering-standards.md`, `.ai/docs/architecture-rules.md`, specyfikacja `2026-10-15-engineering-standards`, log `2026-10-15-engineering-standards`, wzmianka w `2026-11-15-knowledge-maintenance`): oryginał opisuje inny produkt, nosi w treści nazwę zewnętrznego pakietu szkoleniowego i ma adnotację „nie edytuj”. Decyzja (usunięcie albo przeniesienie poza repozytorium) należy do właściciela.
- Wzmianki o zewnętrznym projekcie open source, z którego pochodzą skille `om-*` (`skills-lock.json`, kilka porównań w `docs/RELEASING.md`, logach i specyfikacjach): to źródło zainstalowanych skilli, nie atrybucja materiałów szkoleniowych; poza pojedynczymi zdaniami o przykładach z tego projektu, które przepisano.
- Imię właściciela w kilku logach i specyfikacjach (poza zakresem zadania).
- Nazwy rzeczywistych gałęzi i commitów w historii gita zawierają dawne słowa; historii nie zmieniano.

## Wynik

Wszystkie wskazane obszary zneutralizowane; bramki lokalne zielone. Zostało do decyzji właściciela: los pliku referencyjnego z listy wyżej. Dług techniczny: brak.
