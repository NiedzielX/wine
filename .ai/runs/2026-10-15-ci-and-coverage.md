---
started: 2026-10-15
ended: 2026-10-15
agent: Claude (claude.ai)
spec: none (polecenie właściciela: CI na PR, testy jednostkowe 100%, testy E2E stron głównej i panelu)
outcome: partial
related: [.ai/runs/2026-10-15-engineering-standards.md]
---

# CI na pull request, 100% pokrycia i testy E2E

## Zadanie
CI na każdy PR: build, lint, testy jednostkowe, testy integracyjne z PostgreSQL w testcontainers, uruchomienie aplikacji i test przez agent-browser. Reguła 100% pokrycia w AGENTS.md. Testy jednostkowe dla istniejącego kodu i E2E podstawowych ścieżek.

## Wynik
- **CI** (`.github/workflows/ci.yml`): joby lint, unit, build (z boot:check), database (testcontainers), e2e (zbudowana aplikacja, agent-browser 0.39.1, testcontainers). Plik zwalidowany jako YAML. **Nie uruchomiony na GitHub** (brak dostępu do Actions).
- **Bramki pokrycia 100%** w pięciu pakietach: core, db (bez repozytoriów), app (serwer, trasy API, akcje), ui (feedback), testkit. `npm test`: 499 testów, wszystkie zielone.
- **Wykluczenia** (jawne, w vitest.config.ts): strony i komponenty JSX (pokrywa E2E), shadcn/ui, pakiet mockups, src/testing w core, repozytoria i encje w db (pokrywa test:db).
- **Testy integracyjne bazy:** 47, przez globalny setup (testcontainers lub TEST_DATABASE_URL).
- **E2E:** 9 testów (strona główna 4, panel admina 5) na zbudowanej aplikacji, przez agent-browser.

## Zmiany w zachowaniu (do przeglądu)
- Style win w adresie prefs: kolejność kanoniczna (białe przed czerwonym), jak w prefsToQuery.
- Cena `1.2.3` jest odrzucana (wcześniej 123). Separatory tysięcy tylko, gdy każda grupa ma 3 cyfry.
- `confirmImport`: poprawki są zapisywane przed pokazaniem błędu; wyciszanie błędu usunięte.
- Usunięte martwe gałęzie: `row_invalid`, `suggested` w pokryciu katalogu, sprawdzenie pustego pliku w limit(), zabezpieczenie `delta !== 0`.

## Nie zweryfikowane
- Ścieżka testcontainers (brak Dockera w sandboxie). Używana wersja 11.14, bo 12 wymaga Node 24.
- Instalacja agent-browser na runnerze GitHub (`npm i -g --engine-strict=false`).
- Uruchomienie CI na GitHub.

## Lekcje
- Rozbieżność `engines` (Node 24) u narzędzia CLI: nie czyni go zależnością projektu, instalacja globalna w CI.
