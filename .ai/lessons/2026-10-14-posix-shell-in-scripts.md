---
date: 2026-10-14
updated: 2026-10-14
area: tooling
status: active
source: .ai/runs/2026-10-14-monorepo-foundation.md
promoted: AGENTS.md §1.5
---

# W poleceniach powłoki i skryptach npm pisz POSIX — `/bin/sh` bywa `dash`

## Kontekst
Dwa razy w tym samym dniu `mkdir -p src/{a,b,c}` utworzył jeden katalog o nazwie `{a,b,c}`, a kolejne zapisy plików po cichu się nie udały. Później `${PIPESTATUS[0]}` zakończyło polecenie błędem „Bad substitution”.

## Przyczyna
Na Debianie i Ubuntu `/bin/sh` to `dash`, który nie obsługuje rozwijania nawiasów, tablic ani `[[ ]]`. Tak samo wykonywane są skrypty z `package.json` (npm używa `/bin/sh`), więc ten sam błąd trafiłby do CI.

## Reguła
- Zamiast `{a,b}` pisz pętlę `for d in a b; do mkdir -p "x/$d"; done`.
- Kod wyjścia polecenia z potokiem: zapisz wynik do pliku i sprawdź `$?` osobno.
- Logikę dłuższą niż jedna linia przenieś do `scripts/*.mjs`.
- Po utworzeniu katalogów sprawdź ich listę (`ls`), zanim zapiszesz do nich pliki.

## Jak sprawdzić
`sh -c 'mkdir -p /tmp/t/{a,b}; ls /tmp/t'` — w dash zobaczysz jeden katalog `{a,b}`.

## Nawrót (Faza 5)
Heredoc generujący pliki stron użył `${kind^}` (bashizm): w `dash` powłoka zgłosiła „Bad substitution”, a **oba pliki wyszły puste i `typecheck` przeszedł**. Zasady: pliki generuj Pythonem; po generowaniu sprawdź rozmiar (`wc -l`); zielony typecheck nie dowodzi, że kod istnieje.
