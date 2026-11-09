---
started: 2026-11-09
ended: 2026-11-09 21:10
agent: Claude Code / claude-opus-5-5 (pod-agent, worktree)
spec: brak — zmiana zakresów zależności wewnętrznych, przygotowana w docs/RELEASING.md §5 pkt 4 / §11
outcome: success
related: [.ai/runs/2026-11-09-lesson-22-release-management.md]
---

# Zakresy `@wine-match/testkit` jako dowiązanie do workspace (bez rejestru)

## Zadanie
`packages/app` i `packages/db` przypinają `@wine-match/testkit` dokładnie na `"0.2.0"` (lockfile tak samo). Po zmianie wersji npm szukałby tej nazwy w publicznym rejestrze (dependency confusion), a `release:version --set` odmawia. Cel: forma zakresu, którą npm 11.20.0 rozwiązuje zawsze do workspace; lockfile z `"link": true`; `release:version` przepuszcza tę formę i odrzuca dokładne przypięcia; dokumentacja (RELEASING §5/§11, engineering-standards). Gałąź `chore/workspace-testkit-range`, commit lokalny, bez push i PR. risk-medium.

## Przebieg
- Gałąź z `origin/main` (37d64f9). Przeczytane: `AGENTS.md` (§1.1, §4–§6.1, §9), `.ai/lessons.md`, `docs/RELEASING.md` §5/§11, `scripts/release-version.mjs`, `packages/testkit/tests/release-version.test.ts`, `.ai/docs/commands.md`.
- Wszystkie workspace'y: `app` (`core`, `db`, `ui`: `*`; `testkit`: `0.2.0`), `db` (`core`: `*`; `testkit`: `0.2.0`), `mockups` (`core`: `*`). Pozostałe zależności wewnętrzne już mają `"*"`.

- Eksperyment npm 11.20.0 (`npx -y npm@11.20.0`, workspace `app` → `testkit` w katalogu tymczasowym, `install --offline --registry http://127.0.0.1:9/`, czyli bez dostępu do rejestru):
  - `"*"`, testkit 0.3.0: OK, lockfile `node_modules/@wine-match/testkit` = `{"resolved":"packages/testkit","link":true}`, dowiązanie `-> ../../packages/testkit`.
  - `"workspace:*"`: `npm error code EUNSUPPORTEDPROTOCOL` / `Unsupported URL Type "workspace:"` — npm tego nie obsługuje.
  - `"file:../testkit"`: też `link: true`, ale niestandardowe w repo i `release:version` go nie rozumie; odrzucone.
  - `"0.2.0"` przy testkit 0.3.0: `npm error code ENOTCACHED request to http://127.0.0.1:9/@wine-match%2ftestkit failed` — npm idzie do rejestru (dowód ryzyka).
  - `"0.2.0"` przy testkit 0.2.0: `link: true` (dlatego problem był ukryty do pierwszej zmiany wersji).
- Wybór: `"*"` (jak wszystkie inne zależności wewnętrzne).
- Test najpierw czerwony: nowe przypadki w `release-version.test.ts` (zakres inny niż `"*"` pasujący dziś: `0.2.0`, `^0.2.0`, `~0.2.0`, `""`; `workspace:*`, `file:`, `>=`; `--set --write` odmawia i nic nie zapisuje; `"*"` przechodzi `--set 1.0.0`). Przed zmianą skryptu: `Tests 2 failed | 19 passed (21)`. Po zmianie skryptu, przed zmianą `package.json`: `passes on this repository` czerwony (4 problemy). Po wszystkim: zielone.
- `scripts/release-version.mjs`: `--check` odrzuca każdy zakres `@wine-match/*` inny niż `"*"` (komunikat „matches … today, but not after a version bump” albo dotychczasowy „does not match …”); w `planSet` usunięte drugie sprawdzenie zakresów z nową wersją (po zielonym `--check` wszystkie są `"*"`).
- `packages/app`, `packages/db`: `"@wine-match/testkit": "*"`. Lockfile: `npx -y npm@11.20.0 install --offline --registry http://127.0.0.1:9/` → `up to date`, diff tylko 2 linie (`packages["packages/app"].devDependencies` i `packages["packages/db"].devDependencies`).
- Dokumentacja: `docs/RELEASING.md` §5 pkt 4 i §11, `.ai/docs/commands.md` (`release:version`), `.ai/docs/engineering-standards.md` §1 (wyjątek od `save-exact`), dopisek w lekcji `2026-11-09-release-is-a-human-decision.md`. `AGENTS.md` i `.ai/lessons.md` bez zmian (budżet). `check-boundaries` nie czyta zakresów.

## Weryfikacja
- `node scripts/release-version.mjs --set 0.3.0` (dry run w repo): 15 pól, exit 0.
- Kopia robocza (rsync bez `node_modules`/`.git`): `--set 0.3.0 --write` → `written: 8 file(s)`, `--check --expect 0.3.0` OK; `npm@11.20.0 ci --offline --registry http://127.0.0.1:9/` → `added 572 packages`; lockfile `{"resolved":"packages/testkit","link":true}`, `packages/testkit` 0.3.0; `node_modules/@wine-match/testkit -> ../../packages/testkit`; `npm install` offline: `up to date`, lockfile bez zmian.
- W repo: `npm@11.20.0 ci --offline --registry http://127.0.0.1:9/` → `added 572 packages`, dowiązanie do `packages/testkit`.
- `npm run lint` 0, `typecheck` 0, `npm test` 0 (745 + 126 + 62 + 500 + 490 testów), `npm run build` 0, `check:context` 0 błędów / 9 ostrzeżeń (rozmiary specyfikacji 2026-11-04, sprzed zmiany), `check:qa` OK, `check:routes` OK, `check:boundaries` OK, `secrets:scan` OK, `audit:gate` OK (high 0, critical 0), `release:version -- --check` OK 0.2.0 w 15 miejscach.

## Wynik
Zakresy wewnętrzne `"*"`, lockfile z dowiązaniem workspace, `release:version` pilnuje `"*"` już w `--check` (wcześniej problem ujawniłby się dopiero przy `--set`). Nie sprawdzone: CI na GitHubie (brak push/PR z założenia).
