---
started: 2026-11-18 10:00
ended: 2026-11-18 10:40
agent: Claude Code
spec: .ai/specs/2026-11-18-restaurant-picks.md
outcome: success
related: [.ai/specs/2026-11-18-restaurant-picks.md, .ai/specs/2026-11-04-restaurant-operations.md, .ai/specs/2026-11-04-panel-completion.md]
---

# Specyfikacja `draft`: „Wybór restauracji”, faza 1 (tryb ostrożny z symulatorem)

## Zadanie
Napisać specyfikację draft dla pierwszej fazy funkcji „Wybór restauracji” (P12, część 1 ze strategii produktu): zmiana tylko kolejności i etykiety, surowy Match Score bez zmian, symulator „przed / po”, zbiór w migawce publikacji. Bez implementacji, bez `approved`, bez zmiany `AGENTS.md`, bez push i PR.

## Przebieg
- Gałąź `docs/restaurant-picks-spec` z `origin/main` (po `E13 F1+F2`, #169). Strategia przeczytana przez `git show` z `origin/docs/product-strategy-vs-competitors` (jeszcze nie na main).
- Przeczytane: lekcje (indeks), brief (D22–D25, R02, R06, N01–N04), E19 (F2: R6–R11, Q6–Q10, uprawnienia, ekrany), E13 (R1–R2, kontrakt dla E19), kod: `published-view.ts`, `snapshot.ts`, `recommend.ts`, `recommendation-service.ts`, `permissions.ts`, `usage-events.ts`, `profile-service.ts` (wzór `actor`/`expectedVersion`), `engineering-standards.md` §10, `SCREEN_MAP.md`.
- Ustalenie z kodu: `sellPriority` nie istnieje w kodzie, więc E19 F2 jest niezbudowane i można je zastąpić. Silnik przycina listę do `limit` wewnątrz `recommendForDish`, więc kolejność jako warstwa po silniku wymaga wywołania z pełnym `limit` tylko przy niepustym zbiorze, potem przycięcia i ponownego `markBestValue`.
- Decyzja: spec ZASTĘPUJE E19 F2 (powody w sekcji „Nakładanie z E19”); zbiór „w wersji” (migawka schema 3), nie „na żywo”; uprawnienie `picks.edit`; ekran A27 (identyfikator z planu E19).
- Wykryte przy czytaniu: nagłówek „Polecane do Twojego dania” nie może stać nad pierwszą pozycją z wyboru (to nie najlepsza propozycja silnika), więc `AGENTS.md` §7 wymaga doprecyzowania (PR-A) już przed F1; zmiana zasady o liczbie (PR-B) dopiero przed F2.
- Pominięto: przegląd niezależny (zleci agent nadrzędny), edycję E19 i `AGENTS.md` (pod CODEOWNERS, E19 `approved`).

## Weryfikacja
`node scripts/check-context.mjs`: 0 błędów (12 ostrzeżeń, wszystkie w innych plikach; nowa specyfikacja 32 849 B < 40 960 B). `node scripts/secret-scan.mjs`: 22 trafienia, wszystkie na allowliście, brak innych wzorców. Brak zmian w kodzie, więc lint/test/build nie dotyczą.

## Wynik
Plik `.ai/specs/2026-11-18-restaurant-picks.md` (status `draft`). Do zrobienia: przegląd niezależny, akceptacja człowieka, PR-A do `AGENTS.md`, dopisek w E19, opinia prawna przed F2.

## Lekcje
brak
