---
started: 2026-10-15 14:40
ended: 2026-10-15 15:10
agent: Claude Code / claude-opus-5-5
spec: brak — dokumenty produktowe (brief refresh, backlog), bez zmiany kodu
outcome: success
related: [.ai/runs/2026-10-15-product-brief-discovery-backlog.md]
---

# Backlog techniczny na przyjętych założeniach biznesowych

## Zadanie
Właściciel: „zrobiłeś backlog biznesowy, a my potrzebujemy technicznego. Do założeń biznesowych przyjmuj założenia, np. z researchu”.

## Przebieg
- Decyzja właściciela zapisana jako D09 (`.ai/specs/research/decisions/2026-10-15-d09-build-on-accepted-assumptions.md`), zastępuje propozycję D08. A01–A06: `accepted untested (D09)`; wymóg dowodów w Definition of Ready uchylony przez product ownera dla zakresu Now.
- Pod-agent zmapował luki między dokumentacją a kodem: brak zapisu zdarzeń (`guest_interaction` nieużywana), brak importu sprzedaży i Wine Attach Rate, dashboard tylko z liczbami katalogu, zakładanie restauracji tylko przez seed, brak konfiguracji wdrożenia. Faza 6 planu migracji nierozpoczęta.
- Brief: nowy zakres Now (pomiar, import sprzedaży, dashboard KPI, gotowość do pilotażu), Later rozszerzony, Q05 zamknięte, addendum DoR z dotkniętymi powierzchniami i konfliktem sessionStorage vs działanie bez JS.
- Backlog: epiki E02–E05, 10 historii z kryteriami Given/When/Then (w tym przypadki negatywne), 1 zadanie (migracja sprzedaży), epik E06 Later; issues #11–#26, checklisty epików, mapa w `.ai/specs/backlog.md`. Zadania badawcze #3–#9 zostają otwarte.

## Weryfikacja
- 16 issues z liniami `Backlog source` / `Backlog id` i rodzicem; checklisty w epikach.
- Coverage briefu przeliczone (41 tagów: 25 document, 5 product, 11 assumption).
- Kod aplikacji bez zmian; CI na PR-ze.

## Wynik
Backlog techniczny gotowy do specyfikacji. Pierwsze w kolejce (bez zależności, priorytet wysoki): E02-S01 (#12), E03-S01 (#16), E05-S01 (#24), E05-S02 (#25). Każda historia wymaga specyfikacji przed implementacją (AGENTS.md §3).

## Lekcje
brak
