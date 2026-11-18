---
started: 2026-11-16 17:01
ended: 2026-11-16 17:10
agent: Claude Code
spec: .ai/specs/2026-11-16-catalog-field-editing.md
outcome: success
related: [.ai/specs/2026-11-04-panel-completion.md, .ai/specs/2026-11-04-restaurant-operations.md, .ai/specs/2026-11-04-data-and-import-completion.md]
---

# Draft specyfikacji edycji pól dania i wina w panelu (A3, A5)

## Zadanie
Właściciel zgłosił, że w panelu nie da się edytować dań ani win (nazwa, ceny, opis/nota, kieliszek, status). Napisać specyfikację `draft` bez implementacji, oprzeć się na E13 (panel-completion F1/F2), sprawdzić nakładanie z E19 (restaurant-operations) i data-and-import-completion.

## Przebieg
- Gałąź `docs/catalog-field-editing-spec` z `origin/main` (c0c6ac8). Przeczytano `.ai/lessons.md`, `AGENTS.md` (routing), `.ai/docs/process-templates.md`, `architecture-rules.md`, `engineering-standards.md` §10–§12, `packages/core/AGENTS.md`, `packages/app/AGENTS.md`.
- Specyfikacje: E13 `panel-completion` (R1, R2, Q1, Q2, poza zakresem, kontrakt dla E19: ceny, opisy, nazwy, `status: hidden` „na żywo”; profile, skład karty, tłumaczenia w migawce), E19 `restaurant-operations` (Q1/Q2: `availability` i `active` na żywo, `PATCH /wines/{id}` należy do E19), E20 `data-and-import-completion` (brak nakładania). `phase3-sommelier-writes` i `mockups-to-app-migration-plan` odłożyły edycję dania i wina bez specyfikacji.
- Kod (czytanie): A3/A5 tylko `<dl>` + tłumaczenia; porty zapisu: `WineWriteRepository.setActive`, `ContentWriteRepository`; `permissions.ts` bez `catalog.edit`/`profiles.edit`; `handle()` z jednym uprawnieniem; silnik: `pairingScore` czyta profil i `grapes[0]` (szczepy poza zakresem), ceny tylko w filtrach, remisie, „Najlepszej cenie” i trybie stołu, kategoria w wadze stołu; import nadpisuje opis, kategorię, cenę dania i ceny wina; klucze duplikatów importu po `normKey`.
- Decyzje (szczegóły w specyfikacji Q1–Q12): pola na żywo (zgodnie z E13 Q2), nowe uprawnienie `catalog.edit`, odcisk pól jako `expectedVersion`, własna tabela `catalog_edit`, trasy `…/details`, `useActionState` dla formularzy bez JS, ręczne dodawanie jako faza C3 po E13 F1, usuwanie i szczepy poza zakresem.
- Przegląd: brak narzędzia do uruchomienia pod-agenta w tym przebiegu; przegląd wykonał autor i zapisał to wprost w specyfikacji (sekcja „Przegląd”, `reviewed_by`). Niezależny przegląd nadal wymagany przed akceptacją.
- Specyfikacja przycięta poniżej progu ostrzeżenia `check:context` (40 960 B).

## Weryfikacja
- `node scripts/check-context.mjs` (`npm run check:context` bez `node_modules`; skrypt bez zależności): 0 błędów, 12 ostrzeżeń, wszystkie dotyczą plików istniejących wcześniej; nowa specyfikacja 40 955 B, bez ostrzeżenia.
- `node scripts/secret-scan.mjs` (`npm run secrets:scan`): 22 dopasowania, wszystkie na allowliście; brak nowych.
- Instalacja zależności niepotrzebna (oba skrypty działają bez `node_modules`); `package-lock.json` nietknięty.
- Kod nie zmieniony: lint, typecheck, testy i build nie dotyczą.

## Wynik
Draft `.ai/specs/2026-11-16-catalog-field-editing.md` (status `draft`, bez implementacji). Do zrobienia: niezależny przegląd w świeżym kontekście, decyzje właściciela (Q1, Q5, Q6, Q4, Q7, ostrzeżenie `edited_manually` w imporcie, reset demo), akceptacja.

## Lekcje
Brak (nic nieoczywistego nie zostało odkryte; ustalenia są w specyfikacji).
