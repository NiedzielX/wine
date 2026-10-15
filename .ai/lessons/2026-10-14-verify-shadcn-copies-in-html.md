---
date: 2026-10-14
updated:
area: admin-ui
status: active
source: .ai/runs/2026-10-14-admin-readonly-screens.md
---

# Skopiowane komponenty shadcn sprawdzaj w wyrenderowanym HTML, nie tylko wizualnie

## Kontekst
Pasek postępu z `shadcn new-york-v4` wyglądał poprawnie, ale w HTML miał `data-state="indeterminate"` i brak `aria-valuenow`: czytnik ekranu ogłaszałby „ładowanie” zamiast „60%”.

## Przyczyna
Skopiowany komponent przekazywał `value` tylko do wskaźnika, a nie do elementu głównego Radix. Komponenty shadcn są kopiowane do repozytorium jako kod, więc ich błędy stają się naszymi.

## Reguła
- Po dodaniu komponentu shadcn z atrybutami ARIA (progress, tabs, dialog, select) obejrzyj jego HTML (`curl` strony) i sprawdź atrybuty stanu.
- Poprawki lokalne zapisuj w `packages/ui/AGENTS.md` (sekcja „Lokalne poprawki”) i komentarzem w kodzie, żeby przetrwały aktualizację.
- Asercję o atrybucie dodaj do `scripts/smoke.mjs` (tu: `aria-valuenow` na kolejce review).

## Jak sprawdzić
`curl -s <adres>/admin/halka/review | grep -o 'aria-valuenow="[0-9]*"'`.
