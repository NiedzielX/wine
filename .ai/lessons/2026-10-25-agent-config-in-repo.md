---
date: 2026-10-25
updated:
area: tooling
status: active
source: .ai/runs/2026-10-25-agent-security-hardening.md
promoted: AGENTS.md §9
---

# Konfiguracja agenta w repo: `deny` nie blokuje basha, sandbox na Linuksie ma prywatny localhost, hook zawodzi zamykająco

## Kontekst
Lekcja 9 kursu (bezpieczeństwo narzędzi) i utwardzenie repo (`.ai/specs/2026-10-25-agent-security-hardening.md`). Pięć rzeczy, które nie są oczywiste z samej konfiguracji.

## Przyczyna
Dokumentacja Claude Code i próby w tym środowisku:
- `permissions.deny` na `Read(...)` blokuje wbudowane narzędzia plikowe, **nie** komendy basha; odczyt przez `cat` łapie dopiero sandbox albo hook.
- Reguły `Read` mają składnię gitignore i `deny` wygrywa z `allow` bez wyjątków, więc `Read(**/.env.*)` ukryłoby też `.env.example`. Lista musi być wyliczona.
- Na Linuksie i WSL2 `localhost` w sandboxie jest prywatny. Komendy łączące się z lokalną bazą lub serwerem (`test:db`, `smoke`, `dev`) przestają działać, a sesje chmurowe tego projektu wysyłają HTTPS przez lokalny proxy `127.0.0.1`, więc włączony sandbox mógłby odciąć `git`, `gh` i `npm`.
- Hook `PreToolUse` blokuje tylko kodem **2**; każdy inny kod niezerowy (także 1) to błąd hooka, po którym komenda przechodzi. Hook w basha z `jq` zawodzi, gdy `jq` brakuje.
- Plik `.claude/settings.json` w katalogu głównym sesji ładuje się do tej sesji, więc hook i sandbox działają na agenta, który je pisze.

## Reguła
- Granice dla agenta buduj warstwami: `deny` (narzędzia plikowe), hook (tekst komendy) i sandbox (system); żadna warstwa sama nie wystarcza i hook nie widzi intencji.
- W `deny` wylicz pliki z sekretami; `.env.example` i `.env.template` zostają czytelne.
- Nie włączaj `sandbox.enabled` we wspólnym pliku bez przetestowania go w każdym środowisku, w którym pracuje agent; do czasu testu zostaw gotową konfigurację wyłączoną i opisz włączenie w `security-notes.md`.
- Hook pisz w Node (`.mjs`), parsuj komendę na tokeny, traktuj komunikaty `-m`/`--body` jako tekst, każdą ścieżkę błędu kończ kodem 2 i testuj go tylko przez stdin (żadna komenda z tabeli nie jest wykonywana).
- Konfigurację agenta rozwijaj w osobnym worktree i nie zmieniaj w nim katalogu głównego sesji, dopóki nie jest przetestowana.

## Jak sprawdzić
`npm test -w @wine-match/testkit` (`agent-guardrails.test.ts`, `secret-scan.test.ts`), `npm run secrets:scan`, a lokalnie `/sandbox` i komendy z `security-notes.md` (punkt 5).
