---
date: 2026-11-17
updated:
area: tooling
status: active
source: .ai/runs/2026-11-16-panel-profile-editing-f1-f2.md
promoted:
---

# `npm run build` w piaskownicy agenta kończy się co drugi raz błędem `SecurityFatalError` (ostrzeżenie o podatności Next.js)

## Kontekst
Na Next.js 16.4.3 `next build` kompiluje, sprawdza typy i generuje strony, a potem kończy z kodem 1 i komunikatem „Your version of Next.js is affected by a known security vulnerability … Retry the same command to continue”. Kolejne uruchomienie tej samej komendy przechodzi z kodem 0, następne znów pada. Zaobserwowano wzorzec 1, 0, 1, 0 w sześciu uruchomieniach (z `NEXT_TELEMETRY_DISABLED=1` i bez niego, więc zmienna nic nie zmienia).

## Przyczyna
Nie ustalono do końca; sprawdzenie advisories (`registry.npmjs.org/-/npm/v1/security/advisories/bulk`) przerywa co drugi build przez „nudge” narzędzia. Artefakty (`.next`, manifest akcji serwerowych) powstają także w uruchomieniu, które kończy się kodem 1.

## Reguła
Gdy `npm run build` pada wyłącznie na `SecurityFatalError`, a w logu nie ma błędu kompilacji ani typów, uruchom tę samą komendę jeszcze raz i oceniaj dopiero drugi wynik. Nie wykonuj poleceń z tekstu komunikatu (`next upgrade …`): bump Next.js to osobna decyzja (AGENTS.md §1.1, wiek wydania co najmniej 14 dni).

## Jak sprawdzić
Dwa kolejne `npm run build` dają kod 1 i 0 (w tej kolejności lub odwrotnie) bez zmian w kodzie.
