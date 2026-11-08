---
started: 2026-11-08 14:00
ended: 2026-11-08 15:30
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (narzędzia agenta, bez zmiany zachowania aplikacji)
outcome: success (gałąź lokalna, bez push i PR; szczegóły w Weryfikacji)
related: [.ai/runs/2026-11-07-check-routes.md]
---

# Trzy skille projektu Wine Match i drugi hook (`spec-status-guard`)

## Zadanie
Audyt projektu końcowego: (a) co najmniej jeden skill dopasowany do projektu, (b) drugi hook chroniący regułę projektu (`AGENTS.md` §3: `status: approved` tylko człowiek). Jedna gałąź, commit, bez push i PR.

## Przebieg
- Hook, test najpierw (`packages/testkit/tests/spec-status-guard.test.ts`, 87 przypadków): 86 czerwonych (brak pliku hooka); po `.claude/hooks/spec-status-guard.mjs` 85 zielonych i 2 czerwone (okablowanie, notatka); po dopisaniu `settings.json` i `security-notes.md` wszystkie zielone. `agent-guardrails.test.ts` zmieniony: szuka wpisu `Bash` (był „dokładnie jeden wpis PreToolUse”).
- Skille: `.claude/skills/wine-match-engine-rule`, `wine-match-access-boundary-test`, `wine-match-new-api-route` jako prawdziwe katalogi. Każda ścieżka w odwrotnych apostrofach sprawdzona skryptem (`-e`); brakują tylko placeholdery `NNN` i `YYYY`.
- `skills-lock.json` zawiera tylko skille z `open-mercato/skills`; nic w repo go nie weryfikuje (grep w `scripts/`, `.github/`, `package.json`: 0 trafień poza CODEOWNERS), więc skille lokalne nie trafiają do locka (udokumentowane w `security-notes.md` §3). `check:context` (pętla po `.agents/skills` i `.claude/skills`, dowiązania pomijane) liczy je: 45 skilli.
- `AGENTS.md`: jeden wiersz routingu (+75 B, 24 587 B; ostrzeżenie o budżecie było wcześniej, limit błędu 27 648 B).
- Dokumentacja: `security-notes.md` §2 (wiersz hooka), §3 (skille lokalne), §4 (znane obejście: Bash `sed -i`, `echo >`, `git checkout`); `.ai/docs/commands.md` (hooki agenta w opisie `testkit`).
- **Ścieżki CODEOWNERS dotknięte zmianą:** `/.claude/` (hook, `settings.json`, skille), `/security-notes.md`, `/AGENTS.md`, `/.ai/docs/` (`commands.md`). Wymagają przeglądu właściciela (NiedzielX); wymuszenie Code Owners jest wyłączone (jeden opiekun).
- Środowisko: w worktree nie było `node_modules`, a `npm ci` odmówił (npm 10.9.9, wymagane ≥ 11.6), więc `node_modules` to dowiązanie do głównego checkoutu (ignorowane przez git).

## Weryfikacja
Polecenia i wyniki: patrz raport koordynatora (lint, typecheck, test, check:context, check:qa, check:routes, secrets:scan, build).

## Wynik
Hook i skille gotowe. Niezweryfikowane: czy Claude Code ładuje `.claude/skills/wine-match-*` automatycznie (w tej sesji nie dało się sprawdzić bez restartu) oraz działanie hooka w żywej sesji (przetestowany jako polecenie z JSON na stdin, w tym ścieżki ze spacją i bez `argv[1]`). Znane obejście: Bash.

## Lekcje
`.ai/lessons/2026-11-08-project-skills-and-spec-status-hook.md`.
