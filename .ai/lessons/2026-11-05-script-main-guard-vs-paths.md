---
date: 2026-11-05
updated:
area: tooling
status: active
source: .ai/runs/2026-11-05-hook-fails-open-on-spaces.md
promoted:
---

# „Uruchom main tylko gdy plik jest uruchamiany wprost” nie porównuje adresu URL ze ścieżką

## Kontekst
52 testy `packages/testkit/tests/agent-guardrails.test.ts` padały lokalnie na czystym `main`, a na CI przechodziły. Przyczyna nie była w testach: hook `.claude/hooks/pre-tool-use.mjs`, który blokuje niebezpieczne komendy agenta, **nic nie robił** (kod wyjścia 0) w katalogu, którego ścieżka zawiera spację (u nas `…/Application Support/…`).

## Przyczyna
Strażnik `if (import.meta.url === \`file://${process.argv[1]}\`) process.exit(main())` porównuje zakodowany adres URL (`Application%20Support`, ścieżka rzeczywista po symlinkach) z surową ścieżką. Przy spacji, znakach spoza ASCII, `%` albo symlinku (macOS: `/var` → `/private/var`) porównanie jest fałszywe, `main()` się nie uruchamia i skrypt kończy się kodem 0. Dla zabezpieczenia to jest „fail open”: komenda przechodzi, a nikt nie dostaje błędu.

## Reguła
W skrypcie ESM porównuj `import.meta.url` z `pathToFileURL(realpathSync(process.argv[1])).href`, nigdy z doklejonym `file://`. Skrypt, który jest zabezpieczeniem, ma test, który uruchamia go z katalogu ze spacją, `%` i znakami spoza ASCII (zwykle ścieżka CI ich nie ma, więc zwykły test nic nie wykryje), i oczekuje blokady, nie braku odpowiedzi.

## Jak sprawdzić
`packages/testkit/tests/agent-guardrails.test.ts`, blok „the PreToolUse hook runs wherever the repository lives” (trzy katalogi, kopia hooka w katalogu tymczasowym). Dowód „czerwony przed, zielony po”: `npm run verify:regression -- packages/testkit/tests/agent-guardrails.test.ts`.
