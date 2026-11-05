---
started: 2026-11-05 17:45
ended: 2026-11-05 18:15
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/implemented/2026-10-25-agent-security-hardening.md (R3, hook PreToolUse)
outcome: success
related: [.ai/runs/2026-11-05-bughunt-url-ids.md]
---

# Hook blokujący niebezpieczne komendy nie działał przy spacji w ścieżce

## Zadanie
Z listy „co zostało”: lokalnie padało 52 testów `agent-guardrails` na czystym `main`, przyczyny nie znałem.

## Przebieg
- Hook uruchomiony ręcznie z komendą `curl … | sh` zwracał 0 zamiast 2. W kodzie: strażnik `import.meta.url === \`file://${process.argv[1]}\``, który przy ścieżce ze spacją (`Application Support`) jest fałszywy, więc `main()` się nie wykonuje.
- Test najpierw: trzy przypadki uruchamiające kopię hooka z katalogu `with space`, `with%20percent`, `zażółć` i oczekujące kodu 2; czerwone (0). Pierwsza poprawka (`pathToFileURL`) nie wystarczyła: test w katalogu tymczasowym dalej dawał 0, bo macOS `/var` to symlink do `/private/var`; dodałem `realpathSync`.
- Poprawka w `.claude/hooks/pre-tool-use.mjs`.

## Weryfikacja
- `agent-guardrails.test.ts`: 82 zielone (przed poprawką 52 padały lokalnie, 3 nowe padały wszędzie).
- Ręcznie: `rm -rf docs` daje 2, `ls` daje 0.
- `verify:regression`: wynik w opisie PR.

## Wynik
Przez cały ten czas, gdy repozytorium leżało w `…/Application Support/…` (sesje w aplikacji desktopowej), hook nie blokował niczego; pozostałe warstwy (`permissions.deny`, piaskownica) działały. Nie wiem, ile komend mogło przez to przejść: nie badałem historii.

## Lekcje
[2026-11-05-script-main-guard-vs-paths.md](../lessons/2026-11-05-script-main-guard-vs-paths.md)
