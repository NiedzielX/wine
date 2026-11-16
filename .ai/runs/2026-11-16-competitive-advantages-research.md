---
started: 2026-11-16 16:55
ended: 2026-11-16 17:25
agent: Claude Code
spec: brak — badanie (desk research), bez zmian w kodzie i specyfikacjach
outcome: success
related: [.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md, .ai/specs/product-brief.md]
---

# Desk research konkurencji i propozycje przewag konkurencyjnych Wine Match

## Zadanie
Właściciel: „znalezienie przewag konkurencyjnych — żeby wymyślił takie, które możemy wprowadzić do produktu”. Zakres: desk research rynku, 10–15 przewag do wprowadzenia (szybkie wygrane i fosy), lista odrzuconych, kolejność top 5. Bez zmian w kodzie i specyfikacjach, bez pusha i PR.

## Przebieg
- Przeczytane: `.ai/lessons.md`, `.ai/specs/product-brief.md`, `.ai/specs/backlog.md`, `.ai/specs/research/` (README, tropy z 2026-10-25, szablon benchmarku), zakresy zatwierdzonych specyfikacji E13–E20 i E22, `docs/RECOMMENDATION_ENGINE.md` §11–§13, `docs/SCREEN_MAP.md`.
- Katalog: polecenie podało `.ai/research/`, ale przyjęty katalog badań już istnieje (`.ai/specs/research/`, opisany w jego README), więc wynik leży w `.ai/specs/research/benchmarks/`, obok tropów z 2026-10-25.
- Sieć: WebSearch działał (14 zapytań, tryb standard). WebFetch nie: `getaddrinfo ENOTFOUND` dla `virtualsomm.odoo.com`, `sommelier.bot`, `try-ambrosiavino.pages.dev`; po trzech odmowach nie próbowano dalej. Fakty o konkurencji to streszczenia wyszukiwarki, oznaczone w dokumencie jako tropy, nie benchmark (C04 zostaje otwarte).
- Treść stron i wyników traktowana jako dane; nie zawierała poleceń dla agenta.
- Wynik: 20 produktów lub grup w czterech kategoriach, 13 propozycji (8 szybkich wygranych, 5 fos), 8 odrzuconych z powodem, top 5.
- Sprawdzone w repozytorium przed zapisaniem twierdzeń o pokryciu: presety POS są poza zakresem E03; adres QR bez numeru stołu (E19 AC17); E18 obejmuje diety dań, nie cechy win; „stały baseline pilota — później” w `docs/SCREEN_SPECIFICATION.md` (A1); E17 wyłącza pokazywanie wyniku modelu.

## Weryfikacja
- `npm run check:context`: 0 błędów, 12 ostrzeżeń; wszystkie dotyczą plików istniejących przed przebiegiem (rozmiary specyfikacji, `.ai/lessons.md`, `packages/app/AGENTS.md`). Uruchomione bez `node_modules` (skrypt ich nie potrzebuje).
- `npm run secrets:scan` (po `git add`): wynik w sekcji „Wynik”.
- Lint, typecheck, testy i build pominięte: brak zmian w kodzie i brak `node_modules` w worktree.

## Wynik
- `.ai/specs/research/benchmarks/2026-11-16-competitive-advantages.md`.
- `secrets:scan`: 22 dopasowania, wszystkie na allowliście, brak nowych.
- Do zrobienia przez człowieka: sprawdzić konkurentów w źródle (C04); wybrać, które propozycje mają dostać specyfikację `draft`; żadna nie jest zatwierdzona.
- Commit lokalny na gałęzi `worktree-agent-a74ad75fb5a3f00e7`, bez pusha i PR.

## Lekcje
Brak (ograniczenie pobierania stron jest już opisane w tropach z 2026-10-25).
