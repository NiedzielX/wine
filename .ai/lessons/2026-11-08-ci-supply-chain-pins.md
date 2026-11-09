---
date: 2026-11-08
updated:
area: security
status: active
source: .ai/runs/2026-11-08-ci-supply-chain-hardening.md
promoted: AGENTS.md §9
---

# Łańcuch dostaw CI: akcje przypięte SHA, skrypty instalacyjne wyłączone, hook to guardrail

## Kontekst
Lekcja 18 (łańcuch dostaw i uprawnienia agenta). CI używało ruchomych tagów akcji (`@v4`), checkout zostawiał token w `.git/config`, `npm ci` uruchamiał skrypty instalacyjne zależności, a narzędzia spoza lockfile'a (npm globalnie, `agent-browser`) nie były nigdzie wypisane.

## Przyczyna
Ruchomy tag i skrypt instalacyjny to kod, który zmienia się lub uruchamia bez przeglądu, a w CI ma dostęp do tokenu repozytorium. Domyślne ustawienia narzędzi są wygodne, nie bezpieczne.

## Reguła
- Każda akcja w `.github/workflows` jest przypięta pełnym SHA commita z komentarzem `# vX.Y.Z`. SHA bierz z `gh api repos/<o>/<r>/git/ref/tags/<tag>`; dla tagu adnotowanego (`type: tag`) rozwiń go przez `git/tags/<sha>` do commita. Wydanie nie młodsze niż 14 dni (jak cooldown Dependabota). Dalej aktualizuje je Dependabot.
- `persist-credentials: false` przy checkoucie, który nie pushuje; `permissions: contents: read` w każdym jobie, więcej tylko z powodem. Nazwy jobów wymaganych checków (`lint`, `unit`, `build`, `database`, `e2e`, `secrets`) się nie zmieniają.
- `.npmrc` ma `ignore-scripts=true`. Pakiet, który potrzebuje skryptu, dostaje jawne `npm rebuild <pakiet> --ignore-scripts=false` (bez tej flagi `rebuild` też nic nie uruchomi) i wpis w `security-notes.md` §13, a nie wyłączenie flagi. Narzędzia spoza lockfile'a: `.ai/docs/commands.md`, sekcja „Narzędzia poza lockfile'em”.
- Hook `PreToolUse` jest guardrailem, nie granicą: zatrzymuje pomyłkę, nie napastnika. Nową klasę blokowanych komend dodawaj najpierw jako czerwony przypadek w `agent-guardrails.test.ts`, potem do hooka; opisuj kontrolę, nie sposób jej obejścia (repozytorium jest publiczne). Zmiany stanu wspólnego (merge, push na `main`, `gh api` zapisu, edycja konfiguracji agenta) dają `permissions.ask`.
- Skan sekretów obejmuje też historię (`npm run secrets:scan:history`): sekret znaleziony w starym commicie trzeba zrotować, usunięcie go z `HEAD` nie wystarcza.

## Jak sprawdzić
`npm run secrets:scan:history`; testy w `packages/testkit` (guardrails, secret-scan); każdy wiersz `uses:` w `.github/workflows` ma `# v`.
