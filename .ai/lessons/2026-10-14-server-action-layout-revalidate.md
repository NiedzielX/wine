---
date: 2026-10-14
updated:
area: admin-ui
status: active
source: .ai/runs/2026-10-14-sommelier-writes.md
promoted: packages/app/AGENTS.md
---

# Po akcji serwerowej wołaj `revalidatePath(..., 'layout')`, inaczej liczniki w układzie są nieaktualne

## Kontekst
Po zatwierdzeniu kilku pairingów pasek boczny panelu nadal pokazywał „Review queue 47, Publish 1”, choć strona (np. ekran publikacji) pokazywała poprawne, nowe liczby.

## Przyczyna
Liczniki są renderowane w `layout.tsx`. Next.js zachowuje layouty między nawigacjami po stronie klienta, a przekierowanie z akcji serwerowej odświeża tylko segment strony.

## Reguła
- Każda akcja serwerowa panelu, która zmienia dane, wywołuje `revalidatePath('/admin/<slug>', 'layout')` przed `redirect()` (jest w jednym miejscu: `act()` w `[slug]/actions.ts`).
- Nowe dane w layoutach (liczniki, stan nawigacji) zakładają, że tylko ta funkcja je odświeża.
- Test: po zmianie sprawdź liczby w nawigacji, nie tylko w treści strony.

## Jak sprawdzić
Zatwierdź propozycję na `/admin/<slug>/pairings/<dania>` i odczytaj licznik „Review queue” bez przeładowania strony: zmniejsza się o 1, „Publish” rośnie o 1.
