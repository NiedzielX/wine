---
date: 2026-10-25
updated: 2026-10-25
area: process
status: active
source: .ai/runs/2026-10-25-context-engineering.md
promoted:
---

# Plik wczytywany w każdej sesji ma budżet; szczegóły idą do plików czytanych na żądanie

## Kontekst
Lekcja 10 (context engineering). `AGENTS.md` miał 29 120 B i `CLAUDE.md` 3 212 B (część powtórzona), a pakietowy `packages/app/AGENTS.md` 10 075 B. Codex wczytuje root i `AGENTS.md` pakietu na ścieżce i **odrzuca to, co ponad 32 KiB**: w pakiecie `app` suma wynosiła ok. 39 KB, więc część reguł nie dochodziła do agenta, a nic tego nie zgłaszało.

## Przyczyna
Pliki agentowe rosną z każdym przebiegiem (lekcje, reguły, wyjątki), a nic nie mierzy ich rozmiaru. Szacunek „root mieści się w 12 KB” z planu okazał się nieosiągalny: same reguły procesu (§2–§9) to ok. 14 KB. Przegląd specyfikacji przez niezależnego agenta wyłapał to przed wdrożeniem.

## Reguła
- Do roota `AGENTS.md` trafiają reguły procesu i niezmienniki, które agent musi znać zawsze; szczegóły, polecenia i szablony leżą w `.ai/docs/` i są wskazane w tabeli routingu (blok `routing:start`/`routing:end`).
- Skracając tekst nie zmieniaj numeracji sekcji (odwołania `AGENTS.md §N` są w pakietach, lekcjach, specyfikacjach i kodzie) i zostaw pełną wersję w jednym miejscu (`.ai/docs/*`).
- Budżety pilnuje `npm run check:context` (CI, job `lint`): root, pakiety, łańcuch root + pakiet ≤ 32 KiB (limit Codexa), indeks lekcji, opisy skilli, ścieżki z routingu, importy `CLAUDE.md`, nazwy plików w `.ai/`, odwołania do sekcji, polecenia `npm run …` z instrukcji. Limit zmieniasz w specyfikacji, nie w skrypcie „po cichu”.
- Szacunek tokenów (bajty/3,5) jest informacyjny; pomiarem jest `/context all` w świeżej sesji.
- Liczb z planu nie traktuj jako faktu przed zmierzeniem sekcji.
- Gdy plik pakietu urośnie ponad budżet, przenieś szczegóły dosłownie do `.ai/docs/<pakiet>-details.md` (tak jak `app-details.md`), zostaw jednolinijkowy skrót z odnośnikiem i dopisz plik do wiersza routingu.

## Jak sprawdzić
`npm run check:context` (0 błędów); `npm test -w @wine-match/testkit` (test pilnuje też, że reguły-kotwice nie zniknęły z roota ani z `.ai/docs`).
