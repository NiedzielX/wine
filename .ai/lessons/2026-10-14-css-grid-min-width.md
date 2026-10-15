---
date: 2026-10-14
updated:
area: admin-ui
status: active
source: .ai/runs/2026-10-14-mvp-mockups.md
---

# Dzieci siatki CSS z tabelami lub długą treścią muszą mieć `min-width: 0`

## Kontekst
Ekran Pairings w mockupach (`packages/mockups`, `/admin/pairings/{dishId}`) przy szerokości 390 px wychodził poza ekran: strona dostawała poziome przewijanie, a prawa kolumna była ucięta. Na desktopie problem był niewidoczny.

## Przyczyna
Element siatki ma domyślnie `min-width: auto`, więc nie zwęża się poniżej szerokości swojej najszerszej zawartości (select, tabela, długa nazwa wina). Kolumna `1fr` rozpychała cały układ.

## Reguła
- Kolumny elastyczne definiuj jako `minmax(0, 1fr)`, nie `1fr`.
- Dzieciom kontenerów `.pm` i `.a-grid` (i każdego nowego układu siatki z treścią o zmiennej szerokości) nadawaj `min-width: 0`.
- Tabele owijaj w `.tbl-wrap` (`overflow-x: auto`), żeby przewijała się tabela, a nie strona.

## Jak sprawdzić
Otwórz ekran przy szerokości 390 px i sprawdź w konsoli: `document.documentElement.scrollWidth <= innerWidth`. Ta sama kontrola jest częścią obowiązkowej weryfikacji UI.
