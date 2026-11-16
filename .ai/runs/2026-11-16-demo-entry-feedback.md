---
started: 2026-11-16 13:00
ended: 2026-11-16 13:20
agent: Claude Code
spec: .ai/specs/2026-11-16-interactive-demo-entry.md
outcome: success
related: [.ai/runs/2026-11-16-interactive-demo-entry-impl.md]
---

# Uwagi właściciela do wdrożonego dema: przyciski, strona główna, dane kont

## Zadanie
Trzy decyzje właściciela po obejrzeniu wdrożonego dema: (1) „Zaloguj jako” mają wyglądać jak klikalne przyciski; (2) `/` znów jest widokiem gościa, a widok gościa ma czytelny przycisk do `/start`; (3) na `/start` i karcie `/admin/login` pokazać e-mail i hasło kont demo (tylko tryb interaktywny). Spec zmieniona sekcją „Zmiany po przeglądzie właściciela 2026-11-16” (status bez zmian).

## Przebieg
1. Gałąź `fix/demo-entry-feedback` z origin/main (93d9c4a). Świeży worktree bez `node_modules`: `npm ci` z npm 11 (`--engine-strict=false`) i dowiązanie `@mikro-orm/*` (lekcje `full-install-before-adding-deps`, `mikro-orm-cli-in-nested-worktree`).
2. Przyczyna „nieklikalnych” przycisków: karta używała wariantu `outline`, a `Button` nie miał `cursor-pointer` (Tailwind 4: `cursor: default`). Nowy komponent `(admin)/admin/_components/demo-account.tsx` (przycisk `lg`, pełne tło, e-mail i hasło jako `select-all`), użyty na `/start` i karcie; `cursor-pointer` w `packages/ui` `Button` (wpis w `packages/ui/AGENTS.md`).
3. `/` bez przekierowania do `/start`; `DemoRibbon` wariant `start`: przycisk „Demo: wybierz widok” (pełne tło `surface`, bez cienia i bez nowego promienia, bo `check:design` pilnuje bazowych wartości stron gościa).
4. `demoAccounts` zwraca także `password` (`DEMO_PASSWORD` z `core`), nadal tylko tryb interaktywny i istniejące konta; hash nigdy.
5. Testy: `demo-entry.test.ts` (AC3: hasło w HTML tylko w trybie interaktywnym, brak w produkcji bez flagi / `demo` / postgres bez kont / `pilot`; `scrypt$` nigdy; `/` na `/r/halka`; przycisk w pasku), `demo-entry.e2e.test.ts`, scenariusze QA `admin-015`, `guest-016`.
6. Dokumenty: spec, `DEPLOYMENT.md` §12/§17, `SCREEN_SPECIFICATION.md` (A0, DM6), `threat-model.md` T-37, `CHANGELOG.md`, `packages/app/AGENTS.md`.

## Weryfikacja
- `npm run lint`, `typecheck`: czysto. `npm test`: wszystkie pakiety zielone (app 675 passed, 1 skipped; core 126; db 62; testkit 577; pozostałe po 767 / 126 / 62 bez zmian liczby w tym przebiegu poza `demo-entry`: 32 w pliku).
- `npm run build`: OK (po poprawce `check:design`: cień i `rounded-md` w pasku usunięte).
- `check:context` 0 błędów (11 starych ostrzeżeń), `check:qa` 123 OK, `check:pages` OK, `check:boundaries` OK, `secrets:scan` OK (bez nowych wpisów allowlisty: w plikach nie ma literału hasła, testy importują `DEMO_PASSWORD`).
- E2E na PostgreSQL 16 bez Dockera (systemowy klaster, `TEST_DATABASE_URL`): `demo-entry` 4/4; `access-boundaries-writes`, `showcase`, `security-headers`: razem 21/21.
- Zrzuty Chromium (playwright), `next start` z `DATA_SOURCE=memory ALLOW_DEMO_DATA=true`, stare `next-server` zabite: `/` (→ `/r/halka`, pasek z przyciskiem), `/start`, `/admin/login`, panel po „Zaloguj jako Marta” przy 390 i 1440 px: `scrollWidth == clientWidth`, brak błędów konsoli, zrzuty obejrzane. Kontrasty z tokenów: primary/primary-foreground 10,9:1 (jasny) i 8,5:1 (ciemny), przycisk w pasku (`ink` na `surface`) 17,3:1.
- Niezweryfikowane: `home.e2e.test.ts` i bloki e2e z `agent-browser` (brak narzędzia; `home` dotyczy instancji bez flagi, bez zmian), `test:db` (porty i repozytoria bez zmian), motyw ciemny panelu na zrzucie.

## Wynik
Trzy uwagi wdrożone, spec i dokumenty zaktualizowane. Do rozstrzygnięcia przez człowieka: zgoda na zmianę R3/R5/R6/AC3/R8 (spec nadal `in-progress`).

## Lekcje
Zaktualizowana `.ai/lessons/2026-10-16-postgres-without-docker.md` (Linux jako root: systemowy PostgreSQL przez `runuser`; maskowanie błędu `global-setup`).
