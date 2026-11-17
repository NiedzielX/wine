---
date: 2026-11-17
updated:
area: tooling
status: active
source: .ai/runs/2026-11-16-panel-profile-editing-f1-f2.md
promoted:
---

# Po dodaniu migracji `migrations-roundtrip` pada na „Unknown variable dynamic import”: wyczyść pamięć podręczną Vite

## Kontekst
Po `npx mikro-orm migration:create` test `packages/db/tests/migrations-roundtrip.integration.test.ts` (pierwszy `it`, lista plików migracji) padł z `Error: Unknown variable dynamic import: ../src/migrations/Migration…_profile_editing.ts`, choć plik istniał, a `touch` testu nie pomagał. Poprzednia migracja z tego samego dnia przeszła bez problemu.

## Przyczyna
Test importuje migracje przez `import(`../src/migrations/${name}.ts`)`. Vite zamienia to na glob wyliczony przy transformacji pliku testu i trzyma wynik w `node_modules/.vite*` / `.vitest-cache` w katalogu roota worktree; po dodaniu pliku migracji glob jest nieaktualny.

## Reguła
Po dodaniu migracji przed `npm run test:db` wykonaj `rm -rf node_modules/.vite node_modules/.vite-temp node_modules/.vitest-cache packages/db/node_modules/.vite*`. Błąd jest o pamięci podręcznej, nie o migracji: nie edytuj ani nie zmieniaj nazwy świeżej migracji.

## Jak sprawdzić
Po wyczyszczeniu `npx vitest run --config vitest.integration.config.ts tests/migrations-roundtrip.integration.test.ts` w `packages/db` (z `TEST_DATABASE_URL`) daje 3 zielone testy.
