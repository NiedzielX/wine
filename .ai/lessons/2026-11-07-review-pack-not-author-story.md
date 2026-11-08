---
date: 2026-11-07
updated:
area: process
status: active
source: .ai/runs/2026-11-07-review-protocol-lesson-17.md
promoted:
---

# Recenzent dostaje paczkę (diff, spec, lista kontrolna, CI), nigdy opis PR-a autora

## Kontekst
Lekcja 17 kursu („review i odbiór zadań”). Auto-review LLM znajduje tylko około 15-45% błędów, które później zgłaszają ludzie, więc jest pierwszym sitem, nie decyzją. Opis PR-a, komentarze i komunikaty commitów to deklaracje autora (człowieka, bota, forka), które mierzalnie wpływają na recenzenta: w badaniu z lekcji opis „ta zmiana jest bezpieczna” obniżył wykrywalność najsłabszego modelu o 93 punkty, a przekonujące opisy pisane przez model przepuściły 17 z 17 podatności.

## Przyczyna
Naturalny sposób zlecenia review („zrecenzuj PR #N”) daje recenzentowi wszystko, w tym uzasadnienie autora. U nas wszystkie PR-y idą z konta właściciela, więc o niezależności decyduje wyłącznie świeży kontekst i to, co recenzent widzi.

## Reguła
- Review zlecaj z paczki: `npm run review:pack -- <pr>` (diff, sekcja specyfikacji, lista kontrolna dla ryzyka, CI; bez tytułu, opisu, komentarzy i komunikatów commitów). Jeden pod-agent na PR, świeży kontekst; przy `risk-high` co najmniej dwa niezależne.
- Automatyczne „approve” nie jest decyzją o merge; sweep tylko komentuje; poprawki wyłącznie przez jawne przejęcie. Szczegóły, triage kolejki, ślepe plamy filtra, ochrona gałęzi: `.ai/docs/review-protocol.md`.
- Etykieta PR to decyzja z jednej chwili: przed działaniem sprawdź, kto mówił ostatni, nowe commity i CI.
- Skrypt, który buduje wejście recenzenta, ma test, że tekst opisu PR (także z instrukcjami) nie trafia do wyniku, i że kod nie woła endpointów komentarzy, recenzji ani komunikatów commitów.

## Jak sprawdzić
`packages/testkit/tests/review-pack.test.ts` (blok „never contains the PR title, body…”); ręcznie `npm run review:pack -- <numer istniejącego PR> | grep -c "<fragment opisu>"` daje 0.
