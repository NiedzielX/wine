---
started: 2026-11-16 11:13
ended: 2026-11-16 11:45
agent: Claude Code
spec: .ai/specs/2026-11-16-interactive-demo-entry.md
outcome: partial
related: [.ai/runs/2026-11-16-interactive-demo-entry-spec.md]
author_model: not recorded
---

# Implementacja interaktywnego wejścia do dema (R1–R10, AC1–AC8)

## Zadanie
Zaimplementować zatwierdzoną specyfikację `2026-11-16-interactive-demo-entry` w worktree `wine-demo-entry`: `/start`, „Zaloguj jako …”, karta, pasek powrotu, link w panelu, `/` na `/start`, nagłówki i `noindex`, i18n, testy, QA, `check:pages`, model zagrożeń, dokumentacja. Status specyfikacji zmieniony na `in-progress` na starcie. Uwaga: log założony po pierwszych krokach (lektura i status), nie przed nimi.

## Przebieg
1. Lektura zasad, lekcji i specyfikacji; status specyfikacji `approved` na `in-progress`.
2. core: `allowDemoData` w `AppEnv`, `AuthService.panelAccountsAmong` (port `findUserByEmail` wystarczył, bez zmian portu), testy `env.test.ts`, `auth.test.ts`.
3. app/server: `demo-entry.ts` (`isInteractiveDemo`, `demoStartSlug`, `demoAccounts` bez hashy); `auth-actions.ts`: wspólny `signIn`, `loginAsDemo`; wpis w `check-pages.allowlist.json` (i test `check-pages.test.ts`: dziewięć drzwi).
4. UI: `(showcase)/start/page.tsx` z własnym nagłówkiem, karta w `admin/login`, `DemoRibbon` wariant `start`, link w `AdminShell`, `/` na `/start`, słowniki PL/EN, `proxy.ts` matcher, `next.config.ts` nagłówki, `noindex`.
5. Testy: `tests/unit/demo-entry.test.ts` (31), e2e `demo-entry.e2e.test.ts` (4, osobne instancje z flagą: PostgreSQL po seedzie i pamięć), rozszerzony T-36 w `access-boundaries-writes.e2e.test.ts` (instancja bez flagi odmawia), 4 scenariusze QA (`guest-016`, `guest-017`, `admin-015`, `admin-016`) i uzupełniony `security-025`.
6. Dokumentacja: `DEPLOYMENT.md` §12 i §17, `SCREEN_SPECIFICATION.md` (A0, DM6), `SCREEN_MAP.md`, `threat-model.md` (T-37 i odnośniki z T-08, T-21, T-36), `CHANGELOG.md`, `packages/app/AGENTS.md`.
7. Ślepe uliczki: pierwszy przebieg testów jednostkowych padał na limicie `login` (mock `env` bez `rateLimitRules`) i na asercjach składni HTML; poprawione w teście (env mockowany nad prawdziwym `parseEnv`).

## Weryfikacja
- `npm run lint`: czysto. `npm run typecheck`: bez błędów.
- `npm test`: core 126, db 62 (bez zmian), app 767, testkit po poprawce testu drzwi: wszystkie zielone (po poprawce `check-pages.test.ts`: 140 passed, 1 skipped).
- `npm run build`: OK (trasa `/start` na liście).
- `check:context` 0 błędów (11 ostrzeżeń istniejących, rozmiar starszych specyfikacji); `check:qa`: 123 scenariusze OK; `check:pages` OK (46 funkcji, 9 w allowliście); `check:boundaries` OK; `check:routes` OK; `check:design` OK; `secrets:scan` OK.
- E2E na PostgreSQL 16 z lokalnego klastra (`TEST_DATABASE_URL`, bez Dockera): `demo-entry.e2e` 4/4, `access-boundaries-writes` , `showcase`, `security-headers`: razem 21 passed, 6 skipped (blok z przeglądarką).
- Niezweryfikowane: ekran 390 px i 1440 px (brak `agent-browser`: pobranie Chrome zablokowane przez proxy); `home.e2e.test.ts` (wymaga przeglądarki); `test:db` nie uruchamiane (porty i repozytoria bez zmian); `npm run test:e2e` w całości.

## Wynik
Wszystkie wymagania R1–R10 zaimplementowane, AC1–AC8 pokryte testami poza sprawdzeniem układu w przeglądarce. Do zrobienia po scaleniu: zamknięcie specyfikacji (`implemented`), ręczne sprawdzenie 390/1440 px.

## Lekcje
brak (nic nieoczywistego poza zapisanym w specyfikacji; mock `env` w testach jednostkowych warto budować na `parseEnv(process.env)`, drobiazg bez osobnej lekcji).
