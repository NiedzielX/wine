---
started: 2026-10-25 13:25
ended: 2026-10-25 14:10
agent: Claude Code
spec: .ai/specs/implemented/2026-10-25-context-engineering.md
outcome: success
related: [.ai/runs/2026-10-25-agent-security-hardening.md]
---

# Lekcja 10: zmniejszyć kontekst ładowany do każdej sesji agenta i pilnować go w CI

## Zadanie
Właściciel (Filip) po lekcji 10 (context engineering) zatwierdził w czacie plan faz 0–6 („działaj ze wszystkimi fazami”, 2026-10-25): pomiar bazowy, porządek w `AGENTS.md`, router, bramka `check:context` w CI, higiena danych, reguła o subagentach, pomiar końcowy.

## Przebieg
- 13:25 Założony log i spec (zatwierdzenie w czacie). QA #82 oddane równolegle subagentowi (osobny worktree): PASS, labele qa-approved i qa-self-verified dodane przez subagenta (zweryfikowane: komentarz, `QA head` zgodny z głową PR).
- Przegląd specyfikacji przez niezależnego pod-agenta wykrył cztery blokery: budżet roota nieosiągalny (reguły procesu ok. 14 KB), `packages/app/AGENTS.md` (10 KB) ponad budżet pakietu, „łańcuch” mierzył nie to, co ogranicza Codex (root + AGENTS.md pakietu), przeniesienie §1.x psuje odwołania `AGENTS.md §N`. Zweryfikowałem fakty (suma root + app = 39 KB już przed zmianą; `agent/skills` to osobna śledzona kopia 42 skilli; `.claude/skills` to dowiązania) i poprawiłem spec: budżety z realnych rozmiarów, łańcuch Codex jako bramka, numeracja sekcji bez zmian, kontrola odwołań `§`, kontrola nazw plików, test kotwic zamiast „przeglądu diffu”.
- Podział treści: §1.2–§1.4, §1.6 → `.ai/docs/architecture-rules.md`, §1.5 i dwa punkty testowe z §7 → `.ai/docs/commands.md`, szablony → `.ai/docs/process-templates.md` (dosłownie, skryptem); root: tabela routingu, skróty §1.2–§1.6, §2–§9 bez zmian merytorycznych poza kryterium pod-agentów (§8).
- `scripts/check-context.mjs`, test w testkit (26 przypadków), krok w jobie `lint`, CODEOWNERS `/.ai/docs/`, odnośniki w pakietowych `AGENTS.md`, `CLAUDE.md` odchudzony.

## Weryfikacja
- `npm run lint` (oxlint --deny-warnings): bez uwag.
- `npm run check:boundaries`: zielone. `npm run check:context`: 0 błędów, 3 ostrzeżenia (`packages/app/AGENTS.md` 10 141 B; root + app 32 352 B blisko limitu Codexa; aktywna spec `2026-10-16-recommendation-code.md` 60 232 B).
- `npm run typecheck`: zielone. `npm run secrets:scan`: 18 trafień, wszystkie na allowliście.
- `npm test`: core 579, db 70, ui 62, app 356, testkit 126 testów, wszystkie zielone (testkit zawiera 26 przypadków `check-context`).
- `npm run build`: zielony. `npm run test:db` nie dotyczy (bez zmian w `db`, portach, serwisach).
- Porównanie z oryginałem (`git show dbbc10d:AGENTS.md`): z 240 niepustych linii 238 występuje dosłownie w nowym rootcie albo w `.ai/docs/*`; dwie wyjątki to świadome edycje (zdanie o `check:context` w punkcie o testach i odnośnik w punkcie „Architektura z §1.2–1.4”). Wszystkie zdania z MUSISZ/NIE WOLNO/POWINIENEŚ z oryginału występują dosłownie.
- Pomiar przed/po: tabela w specyfikacji („Realizacja”).

## Wynik
Fazy 0–6 wykonane. Stały koszt sesji Claude Code spadł z ok. 9,2 tys. do ok. 6,7 tys. tokenów (szacunek), pakiet `app` przestał przekraczać limit Codexa. Cel „root ≈ 150 linii” z planu nie został osiągnięty: root ma 238 linii i 22 KB, bo reguły procesu to ok. 14 KB. Dług techniczny: `packages/app/AGENTS.md` (10 KB, margines do limitu Codexa ok. 400 B), osierocony `agent/skills`, aktywna spec 60 KB. Zadania właściciela: `/context all` w świeżej sesji przed i po; decyzja o `agent/skills`. AC6b zamknięte: CI zielone w PR #100.

## Lekcje
- `.ai/lessons/2026-10-25-context-budget-and-routing.md`
