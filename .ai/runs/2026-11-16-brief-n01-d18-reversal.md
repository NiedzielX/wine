---
started: 2026-11-16 17:00
ended: 2026-11-16 17:10
agent: Claude Code
spec: brak — zmiana decyzji produktowych przez właściciela (brief, `docs/PRODUCT_CONCEPT.md`)
outcome: success
related: [.ai/specs/research/benchmarks/2026-11-16-competitive-advantages.md]
---

# Właściciel uchyla N01 (sponsorowane pozycje) i D18 (uczenie między restauracjami)

## Zadanie
Polecenie właściciela w czacie 2026-11-16: „chcemy sprzedawać” (N01) i „chcemy uczyć między restauracjami” (D18).

## Przebieg
- `.ai/specs/product-brief.md`: N01 → `superseded by D22`, D18 → `superseded by D23`; nowe decyzje D22 (sponsorowane pozycje) i D23 (uczenie i benchmarki między restauracjami) z warunkami do rozstrzygnięcia w specyfikacjach.
- `docs/PRODUCT_CONCEPT.md` §5 „Zasada zaufania” zaktualizowana do D22.
- Zostawione bez zmian (właściciel ich nie uchylił): R02 (Match Score surowy), R06 („Para sommeliera” tylko po decyzji sommeliera), N02, N03, izolacja tenantów w repozytoriach (`AGENTS.md` §1.3; uczenie między lokalami idzie przez osobny potok danych zagregowanych, nie przez zapytania bez `restaurantId`).

## Dopisek (ten sam dzień)
Właściciel uchylił też warunki dopisane przez agenta: R02 → `superseded by D24` (restauracja podbija wina, także wyświetlany wynik) oraz brak obowiązku oznaczenia sponsoringu (D25). Agent zapisał w D25 ryzyko prawne (nieujawnione płatne pozycjonowanie, dyrektywa 2005/29/WE zał. I pkt 11a) i rekomendację opinii prawnej przed wdrożeniem. `AGENTS.md` §7 („Sommelier ponad modelem”: Match Score bez podbijania) pozostaje bez zmian do czasu specyfikacji wdrożeniowej D24; do tego momentu kod się nie zmienia.

## Do zrobienia (osobne specyfikacje)
- Sponsorowane wina: model danych, oznaczenie „Sponsorowane”, zgoda restauracji, rozliczenia z dostawcami, wymogi prawa konsumenckiego UE.
- Uczenie między restauracjami: podstawa RODO i umowy powierzenia, agregacja/anonimizacja, progi benchmarku; przegląd zatwierdzonych specyfikacji powołujących się na D18 (E14, E16, E17, E18, E19, E20, E21, E22, E13, plan produktu) — dziś traktują D18 jako ograniczenie.

## Weryfikacja
`npm run check:context`, `npm run secrets:scan` (wyniki w PR).

## Lekcje
brak (decyzje zapisane w briefie)
