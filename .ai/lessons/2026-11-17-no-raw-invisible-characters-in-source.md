---
date: 2026-11-17
updated:
area: tooling
status: active
source: .ai/runs/2026-11-17-catalog-field-editing-c1.md
promoted:
---

# Listy znaków niewidocznych buduj z numerów punktów kodowych, nie z zapisów `\uXXXX` w pliku

## Kontekst
Pierwsza wersja `catalog-text.ts` miała w wyrażeniu regularnym zapisy ` `, `‮`, `​` i podobne. Po zapisaniu pliku narzędziem edycji część zapisów (od `­` w górę) stała się surowymi znakami: ` ` w literale regex przerywa linię i plik się nie kompilował, a niewidoczne i kierunkowe znaki w źródle (U+202E) to też ryzyko „Trojan Source”. Test z łańcuchami zawierającymi te znaki miał ten sam problem.

## Reguła
Zakresy zakazanych znaków trzymaj jako liczby (`[0x200b, 0x200f]`, `String.fromCodePoint`) i sprawdzaj kod odwrotnym grepem: `grep -nP "[^\x00-\x7e]"` po zapisaniu pliku, w którym miały być tylko escape'y. Polskie litery i emoji w testach są dozwolone; niewidoczne znaki nie.

## Jak sprawdić
`packages/core/src/validators/catalog/catalog-text.ts` (tablica `FORBIDDEN`) i `catalog-edit-rules.test.ts` (helper `cp`) nie zawierają znaków niewidocznych.
