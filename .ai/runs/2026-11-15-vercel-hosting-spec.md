---
started: 2026-11-15 10:00
ended: 2026-11-15 11:30
agent: Claude Code
spec: .ai/specs/2026-11-15-vercel-hosting.md
outcome: partial
related: [.ai/runs/2026-10-29-bump-next-undici.md]
---

# Specyfikacja wdrożenia całości (produkcja i demo) na Vercelu

## Zadanie
Właściciel (Filip) zdecydował: „zacząłbym od całości na Vercel, prod też”. To zmienia D10 (jedna VM, Docker Compose), więc wg §3 wymaga specyfikacji. Zapisuję draft, oddaję do niezależnego przeglądu i proszę o akceptację; nie implementuję i niczego nie wdrażam (wdrożenie wymaga konta właściciela u dostawcy, sekretów nie biorę do promptów).

## Przebieg
- Sprawdzony stan `main` (Dockerfile, compose, `DEPLOYMENT.md`, `release.yml` w trybie szkicu, `next.config.ts`, pula MikroORM `DB_POOL_*`).
- Desk research o ograniczeniach Vercela: streszczenia wyszukiwarki, bo `vercel.com` nie jest dostępny z tej sesji (`getaddrinfo ENOTFOUND`). Zapisane w spec jako do sprawdzenia w dokumentacji, nie jako zweryfikowane.

- Niezależny przegląd specyfikacji (pod-agent, tylko odczyt): 4 ustalenia blokujące, 8 ważnych, kilka drobnych. Sprawdziłem w kodzie te, od których zależały blokery: aplikacja nie ma kontroli zaległych migracji (tylko promise w `container.ts`), w `packages/app/src` nie ma limitera zapytań (tylko `metrics.ts`), `showcaseMode: 'demo'` ładuje `users: []`. Spec przepisany: faza spike F0 przed kodem, podział F1 na PR-y, dwa adresy bazy, `health` z migracjami, SHA wdrożenia = tag, limity zapytań jako zależność od E21 F3, logi bez query string, HSTS i inne wymagania proxy, ścieżka awaryjna, nowe AC (AC3 liczbowe, AC5 e2e, AC8 rozbite).
- Pytania Q1–Q12 dla właściciela z rekomendacjami.
- Uwaga właściciela po przeglądzie: zamiast kont demo w Preview założyć własnych użytkowników testowych. Przyjęte: R8, AC7 i Q5 przepisane na osobną bazę testową z dwiema restauracjami i niepublicznymi hasłami, testy logowania i izolacji w CI.

## Weryfikacja
- Dokumentacja bez zmian w kodzie; `npm run check:context` do uruchomienia przed PR-em.
- Fakty o Vercelu i Neonie nie są zweryfikowane w źródle (`vercel.com` poza dozwolonymi domenami sesji); zapisane jako „do potwierdzenia w F0”.

## Wynik
Draft specyfikacji po przeglądzie, `status: draft`; czeka na decyzje Q1–Q12 i akceptację właściciela. Nic nie wdrożono, kodu nie zmieniono.

## Lekcje
(uzupełniane)
