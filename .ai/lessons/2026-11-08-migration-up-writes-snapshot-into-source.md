---
date: 2026-11-08
updated:
area: ops
status: active
source: .ai/runs/2026-11-08-e11-f2-f3-image-and-runbook.md
promoted:
---

# Obraz `migrator` musi pozwalać użytkownikowi `node` pisać w `packages/db/src/migrations`: `migration:up` zapisuje `.snapshot-<baza>.json`

## Kontekst
Pisząc `Dockerfile` (E11 F2) bez Dockera na maszynie, uruchomiłem kroki obrazu ręcznie w kopii układu plików (`npm ci`, `db:migrate`, `restaurant:create`, `next start` z układem `runtime`). Po `db:migrate` w drzewie źródeł pojawiły się `packages/db/src/migrations/.snapshot-wm_a.json` i `.snapshot-wm_b.json`.

## Przyczyna
CLI MikroORM po `migration:up` odświeża snapshot schematu obok migracji (nazwa od bazy). Obraz, w którym `/app` należy do roota, a proces działa jako `node`, kończyłby `migrate` błędem uprawnień (kod ≠ 0), więc `app` nigdy by nie wystartował (`service_completed_successfully`).

## Reguła
W celu `migrator` źródła pakietów kopiuj z `--chown=node:node` (`COPY --chown=node:node packages packages`). Układ `runtime` tego nie potrzebuje (proces pisze tylko w `packages/app/.next`). Przy każdej nowej ścieżce, którą narzędzie CLI zapisuje, sprawdź ją wykonując polecenie w kopii układu obrazu i porównując `find -newer`, zanim zaufasz „powinno działać”.

## Jak sprawdzić
`find packages -newer package.json -type f -not -path '*/node_modules/*'` po `npm run db:migrate` w kopii układu obrazu; w CI job `image` uruchamia `migrate` jako `node`. Kolejne pułapki z tego przebiegu: `COPY --from=prod-deps /app/packages/app/node_modules` pada, gdy katalog nie istnieje (kopiuj cały `/app` ze stage’u i nałóż źródła); `timeout` nie istnieje na macOS (lokalne próby bez niego).
