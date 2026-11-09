# Baza wiedzy QA

Pamięć sesji QA, czytana na początku następnej sesji o tym samym obszarze (krok 1 `.ai/docs/qa-protocol.md`). To nie są scenariusze e2e: `scripts/check-qa-scenarios.mjs` pomija ten katalog.

## Reguła

**Każda sesja QA dopisuje wpis, także gdy nie znalazła błędów.** Czysty przebieg obniża sygnał ryzyka obszaru, więc jest daną. Wpis jest dopisywany; istniejących wpisów nie przepisuj (poprawiaj tylko to, co nieprawdziwe, z datą poprawki). Nie wpisuj szumu sesji (nazw zrzutów, sekwencji kliknięć): to idzie do raportu w PR.

## Nazwa pliku

`YYYY-MM-DD-{obszar}-{slug}.md`, np. `2026-11-08-security-seed.md`; data i slug jak w `AGENTS.md` §2 (małe litery ASCII). Obszar to folder z `.ai/qa/README.md`.

## Format wpisu

```markdown
---
date: YYYY-MM-DD
area: <obszar z .ai/qa/README.md>
target: <PR #N | gałąź | seed>
commit: <sha albo „n/a (seed)”>
verdict: <PASS | FAIL | CZĘŚCIOWE | seed, brak sesji QA>
bugs: <liczba>
---

# <obszar>: <jedno zdanie, co przetestowano>

## Pokryte
Odwołania do scenariuszy `.ai/qa/{AREA}-NNN` i testów, które już istnieją; wyrocznie (AC, linie docs).

## Wynik sesji
Fakty z sesji (metoda każdego sprawdzenia, role, viewporty, języki). Dla wpisu seed: „brak sesji QA, nic nie uruchomiono”.

## Punkty ryzyka (hotspoty)
Punktory: co się psuje, dlaczego, jak wykryć; tylko to, co jest nowe i nieudokumentowane gdzie indziej.

## Wymaga ludzkiego oka
Pozycje przekazane właścicielowi albo „brak”.

## Luki
Czego nie sprawdzono i dlaczego.
```

## Wpisy

| Plik | Obszar | Werdykt |
|---|---|---|
| [2026-11-08-security-seed.md](2026-11-08-security-seed.md) | security | seed, brak sesji QA |
