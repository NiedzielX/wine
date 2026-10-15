---
date: 2026-10-15
updated:
area: tooling
status: active
source: .ai/runs/2026-10-15-engineering-standards.md
promoted: AGENTS.md §1.6
---

# Konfiguracja zawodzi zamykająco, ale budowanie nie może jej wymagać

## Kontekst
- `DATA_SOURCE` było czytane jako „postgres albo cokolwiek innego = memory”: literówka uruchamiała dane demo z publicznymi hasłami, także w produkcji.
- Po wprowadzeniu walidowanej konfiguracji strona `/` (statycznie renderowana) wywołała ją podczas `next build`, a build w produkcji bez środowiska **się wywalił**. Wymóg „aplikacja buduje się bez bazy i bez zmiennych” złamałem sam.
- Skrypt testowy z `pkill -f "next start …"` zabił **własną powłokę**, bo ten ciąg był w jej linii poleceń.

## Reguła
- Konfigurację waliduj Zod, w jednym miejscu, i wszystko, co decyduje o tym, kto co zobaczy, **zawodzi zamykająco** (jawny `DATA_SOURCE` w produkcji, demo tylko z `ALLOW_DEMO_DATA=true`).
- Konfigurację czytaj **leniwie** i tylko w trasach `force-dynamic`; nie przy imporcie modułu i nie w stronie renderowanej statycznie. Sprawdzenie przy starcie serwera robi `instrumentation.ts` (nie dotyka `next build`) i kończy proces kodem 1.
- Dowód: `env -i … npm run build` (bez środowiska i bez bazy) oraz `npm run boot:check`. Oba są w CI.
- Procesy zatrzymuj po PID lub wzorcem, który nie pasuje do własnej linii poleceń (`pkill -f '[n]ext-server'`).

## Jak sprawdzić
`npm run build` w czystym środowisku, potem `npm run boot:check`.
