---
started: 2026-11-28 09:00
ended: 2026-11-28 09:10
agent: Claude Code
spec: brak — poprawka dokumentacji
outcome: success
related: [.ai/runs/2026-11-27-release-0-4-0.md]
---

# Rollback na Vercelu w docs/DEPLOYMENT.md

## Zadanie
Runbook rollbacku (sekcja 10) dotyczył tylko VM z Dockerem, a produkcja działa na Vercelu z Supabase. Właściciel kazał dopisać.

## Przebieg
Nowa sekcja 17.2: kiedy wycofać, Instant Rollback i `vercel rollback`, wstrzymanie przypinania kolejnych wdrożeń, baza przy wycofaniu (expand/contract, zakaz `migration:down`), zmienne środowiska działają od następnego wdrożenia, weryfikacja, kto decyduje. Opis zachowania Vercela (wstrzymanie przypinania) pochodzi z wiedzy ogólnej i nie był sprawdzony na tym projekcie.

## Weryfikacja
Ścieżka `/api/v1/health` istnieje w kodzie. Zmiana tylko w dokumentacji; CI na PR.

## Wynik
Luka z listy wymagań zamknięta po scaleniu.

## Lekcje
brak
