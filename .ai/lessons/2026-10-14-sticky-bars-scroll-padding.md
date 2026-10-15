---
date: 2026-10-14
updated:
area: guest-ui
status: active
source: .ai/runs/2026-10-14-guest-app-parity.md
promoted: packages/app/AGENTS.md
---

# Przyklejone paski wymagają `scroll-padding` na `html`, inaczej zasłaniają elementy

## Kontekst
Na ekranie wyboru dań stolika (`/r/{slug}/table`) przyklejony dolny pasek (licznik + przycisk) zasłaniał pola wyboru przewijane do dolnej krawędzi. Test w przeglądarce nie mógł kliknąć pola: „subtree intercepts pointer events”. To samo dotyczy klawiatury: zaznaczony element mógł chować się pod paskiem (WCAG 2.4.11).

## Przyczyna
`position: sticky` nie zmienia obszaru, do którego przeglądarka przewija element (`scrollIntoView`, fokus). Przezroczysta część gradientu paska łapała też dotknięcia.

## Reguła
- Każda aplikacja z przyklejonym paskiem ma w CSS bazowym `html { scroll-padding-top: <wysokość górnego paska>; scroll-padding-bottom: <wysokość dolnego paska>; }` (gość: `guest.css`).
- Przyklejony pasek: `pointer-events-none`, a jego kontrolki `pointer-events-auto` (`*:pointer-events-auto`), żeby tło nie połykało dotknięć.
- Wysokość paska zmieniasz — zmień też `scroll-padding`.

## Jak sprawdzić
Playwright: `page.locator('input').last.check()` na ekranie z paskiem nie kończy się timeoutem; ręcznie: Tab przez wszystkie pola — fokusowany element nigdy nie jest pod paskiem.
