---
date: 2026-11-08
updated:
area: tooling
status: active
source: .ai/runs/2026-11-08-project-skills-and-spec-status-hook.md
promoted:
---

# Reguła z AGENTS.md, której nic nie egzekwuje, jest życzeniem: dodaj hook, a powtarzalny proces zapisz jako skill projektu

## Kontekst
Audyt projektu końcowego: 42 skille to ogólne `om-*`, żaden nie zna Wine Match, a jedyny hook (Bash) nie chronił żadnej reguły projektu. `AGENTS.md` §3 mówi, że `status: approved` ustawia tylko człowiek, ale agent mógł to zapisać zwykłym Edit.

## Przyczyna
Reguły procesu żyły tylko w tekście; skille pochodziły z zewnętrznego źródła i nie opisywały naszych niezmienników (silnik deterministyczny, trzy sprawdzenia granicy, wrapper tras).

## Reguła
- Regułę, której złamanie da się wykryć z wywołania narzędzia, egzekwuj hookiem `PreToolUse` (`.claude/hooks/`), z czystą funkcją `decide()` i testem tabelarycznym; hook to poręcz, nie granica: zapisz znane obejście (Bash `sed -i`) w `security-notes.md`.
- Hook w ścieżce chronionej zawodzi zamykająco (nieczytelny nagłówek = odmowa), poza nią nie czyta dysku.
- Skille projektu to zwykłe katalogi w `.claude/skills/wine-match-*` (nie dowiązania do `.agents/skills`), poza `skills-lock.json` (tylko źródła zewnętrzne; nic go nie weryfikuje); `check:context` je liczy.

## Jak sprawdzić
`npm test -w @wine-match/testkit` (`spec-status-guard.test.ts`, `agent-guardrails.test.ts`), `npm run check:context` (45 skilli).
