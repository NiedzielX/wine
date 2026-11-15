---
started: 2026-11-15 10:00
ended:
agent: Claude Code
spec: .ai/specs/2026-11-15-vercel-hosting.md
outcome:
related: [.ai/runs/2026-10-29-bump-next-undici.md]
---

# Specyfikacja wdrożenia całości (produkcja i demo) na Vercelu

## Zadanie
Po lekcji 24 właściciel (Filip) zdecydował: „zacząłbym od całości na Vercel, prod też”. To zmienia D10 (jedna VM, Docker Compose), więc wg §3 wymaga specyfikacji. Zapisuję draft, oddaję do niezależnego przeglądu i proszę o akceptację; nie implementuję i niczego nie wdrażam (wdrożenie wymaga konta właściciela u dostawcy, sekretów nie biorę do promptów).

## Przebieg
- Sprawdzony stan `main` (Dockerfile, compose, `DEPLOYMENT.md`, `release.yml` w trybie szkicu, `next.config.ts`, pula MikroORM `DB_POOL_*`).
- Desk research o ograniczeniach Vercela: streszczenia wyszukiwarki, bo `vercel.com` nie jest dostępny z tej sesji (`getaddrinfo ENOTFOUND`). Zapisane w spec jako do sprawdzenia w dokumentacji, nie jako zweryfikowane.

## Weryfikacja
(uzupełniane)

## Wynik
(uzupełniane)

## Lekcje
(uzupełniane)
