---
date: 2026-11-27
updated:
area: tooling
status: active
source: .ai/runs/2026-11-27-orchestration-session.md
promoted:
---

# CodeQL „Bad HTML filtering regexp” w testach: wycinaj `<script>` jednym sprawdzonym wzorcem

## Kontekst
Test wycinający `<script>` z HTML dostał alert CodeQL „Bad HTML filtering regexp”. Nierozwiązany wątek recenzji z tym alertem blokuje scalanie regułą „All comments must be resolved”.

## Przyczyna
Wzorzec bez flagi `i` i bez `[^>]*` w znaczniku końcowym jest uznawany za niepełne filtrowanie HTML; kolejne uproszczone warianty sprawiały, że alert wracał.

## Reguła
Wycinaj skrypty wzorcem `/<script\b[\s\S]*?<\/script[^>]*>/gi`. Nie upraszczaj go: flaga `i` i `[^>]*` w znaczniku końcowym są potrzebne. Wątek recenzji z alertem rozwiąż po zielonym ponownym skanie.

## Jak sprawdzić
Code scanning w PR nie pokazuje otwartego alertu „Bad HTML filtering regexp”, a wątek jest rozwiązany.
