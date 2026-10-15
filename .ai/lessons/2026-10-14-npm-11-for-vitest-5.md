---
date: 2026-10-14
updated:
area: tooling
status: active
source: .ai/runs/2026-10-14-monorepo-foundation.md
promoted: AGENTS.md §1.1, §1.5
---

# Monorepo wymaga npm ≥ 11.6 — npm 10 nie instaluje Vitest 5

## Kontekst
`npm install` z npm 10.9 (dołączanym do Node 22) kończył się błędem `Cannot read properties of null (reading 'edgesOut')`, także w pustym projekcie z samym `vitest@5.0.2`. Dodanie `vite` jako jawnej zależności nie pomogło.

## Przyczyna
Błąd w `@npmcli/arborist` npm 10 przy rozwiązywaniu zbioru opcjonalnych peer dependencies Vitest 5 (`#loadPeerSet`). npm 11 instaluje ten sam zestaw poprawnie.

## Reguła
- Wymagane: npm ≥ 11.6 (`packageManager: npm@11.20.0`, `engines.npm`, `.npmrc: engine-strict=true` — stary npm kończy się czytelnym błędem zamiast `edgesOut`).
- Widząc `edgesOut` lub inne błędy arborist, najpierw sprawdź `npm -v`, zanim zaczniesz zmieniać zależności.
- npm 11.20 domyślnie blokuje skrypty instalacyjne. Decyzję zapisuj w `allowScripts` w `package.json` (`npm install-scripts approve|deny <pakiet>`). `esbuild` działa bez skryptu (binarka z pakietu opcjonalnego) — jest na liście `deny`.

## Jak sprawdzić
`npm -v` ≥ 11.6; `npm install` w czystym klonie kończy się bez błędów; `npm install-scripts ls` nie pokazuje nieobsłużonych pakietów.
