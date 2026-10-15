---
started: 2026-10-15 13:20
ended: 2026-10-15 13:40
agent: Claude Code / claude-opus-5-5
spec: brak — konfiguracja procesu, bez zmiany zachowania aplikacji
outcome: success
related: [.ai/runs/2026-10-15-agent-pipeline-setup.md]
---

# Warstwa produktowa SDLC (om-setup-discovery-pipeline)

## Zadanie
Po lekcji 4 właściciel poprosił o uruchomienie `om-setup-discovery-pipeline`: pytania o role i zmiany w PR-ze. To pierwszy krok przed researchem, `om-discover` i `om-backlog`.

## Przebieg
- Odpowiedzi właściciela: jest ekspert domenowy poza product ownerem (np. sommelier / Wine Director zatwierdzający reguły parowania); designera nie ma.
- `.ai/agentic.config.json`: dodany tylko klucz `discovery` (`enabled: true`, `domainExpert: true`, `designer: false`); reszta bez zmian.
- `SDLC.md`: bloki z szablonu skilla wstawione w miejsca z `sdlc-sections.md`: akapit o product briefie w „Purpose”, role Product owner i Domain expert przed Maintainerem, wiersze Discovery i Intake w tabeli cyklu życia (zastąpione wersjami z Definition of Ready), sekcje „Definition of Ready” i „Product decisions as a protected contract” przed „Label state machine”, akapit o własności bloków w „Amending this process”. Bloki w znacznikach `discovery:start/end`, wiersze i punkty listy z `<!-- discovery -->`.
- Zastąpione wiersze: Discovery (dotąd: rozmowa z `om-brainstorm`) i Intake (dotąd: ticket „with enough detail to act on”).
- `.ai/specs/research/` utworzony; tam trafią notatki z wywiadów, dane i rekordy decyzji dla `om-discover`.
- `AGENTS.md` bez zmian: nie ma tabeli routingu zadań, do której skill dopisuje wiersz.

## Weryfikacja
- `python3 -m json.tool .ai/agentic.config.json` — poprawny JSON.
- `SDLC.md`: 3 bloki w znacznikach, 4 linie z inline `<!-- discovery -->`, jeden wiersz Discovery i jeden Intake w tabeli.
- Skille produktowe (`om-discover`, `om-synthetic-users`, `om-backlog`, `om-mockup-prototype`) obecne w `.agents/skills` i `.claude/skills`.
- Kod aplikacji bez zmian; bramkę uruchamia CI na PR-ze.

## Wynik
Warstwa produktowa włączona. Następny krok: materiały w `.ai/specs/research/`, potem `/om-discover "Wine Match" --mode existing --research .ai/specs/research`.

## Lekcje
brak
