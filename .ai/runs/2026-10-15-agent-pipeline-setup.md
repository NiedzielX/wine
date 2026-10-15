---
started: 2026-10-15 12:10
ended: 2026-10-15 12:40
agent: Claude Code / claude-opus-5-5
spec: brak — konfiguracja procesu, bez zmiany zachowania aplikacji
outcome: success
related: [.ai/runs/2026-10-15-ci-and-coverage.md]
---

# Konfiguracja SDLC dla skilli om-* (om-setup-agent-pipeline)

## Zadanie
Właściciel poprosił o przejście `om-setup-agent-pipeline`: pytania, wygenerowanie `.ai/agentic.config.json` i dokumentów procesu, założenie labelek na GitHubie, całość przez PR.

## Przebieg
- Odpowiedzi właściciela: szybka bramka walidacji (lint, check:boundaries, typecheck, test, build — bez Dockera; `audit:gate`, `test:db`, `boot:check`, `test:e2e` zostają w CI), pełna taksonomia labelek, bramka QA włączona, wygenerować `SDLC.md`, `CODE_REVIEW.md`, `BACKWARD_COMPATIBILITY.md`. `AGENTS.md` już istniał, więc pominięty.
- Wartości domyślne bez pytania: tracker `github`, przeglądarka `agent-browser` (CI już jej używa), `paths.specs` = `.ai/specs`, brak `reviewChecklist`.
- `closeKeywords` po polsku (`zamyka`, `naprawia`, `rozwiązuje` i formy przeszłe), bo opisy PR-ów są po polsku; bez tego `om-close-fixed-issues` nie zamknąłby issue.
- Zainstalowane opisy: `.ai/trackers/github.md`, `.ai/browsers/agent-browser.md` (kopie z `om-setup-agent-pipeline/references`).
- `SDLC.md` wygenerowany z szablonu (bez bloków discovery), po angielsku jak szablon; dopisany akapit o kontrolach tylko w CI.
- `CODE_REVIEW.md` i `BACKWARD_COMPATIBILITY.md` po polsku, jak reszta dokumentacji; treść z inwentarza repo (trasy `/api/v1`, adresy gościa i QR, migracje, env, role, format importu, `ENGINE_VERSION`).
- `.gitignore`: stan per-przebieg QA (`.ai/qa/artifacts_*/`, `test-env.json`, `test-env.env`).
- GitHub: utworzono 25 labelek; `bug` i `documentation` istniały i zostały bez zmian.

## Weryfikacja
- `python3 -m json.tool .ai/agentic.config.json` — poprawny JSON.
- Sprawdzenie pokrycia skilli (`om-setup-agent-pipeline/references/skill-coverage.md`) dla `.agents/skills` i `.claude/skills`: `SKILL_COVERAGE_OK`.
- `gh label list`: 35 labelek, w tym cała taksonomia z configu.
- Ścieżki cytowane w nowych dokumentach sprawdzone na dysku. Kod aplikacji bez zmian; lokalnie brak Node, bramkę uruchamia CI na PR-ze.

## Wynik
Pipeline skonfigurowany. Do zrobienia przez maintainera: ochrona gałęzi `main` (wymagane joby CI, zakaz pushy bez PR-a), bo bez niej bramki z `SDLC.md` są tylko umową.

## Lekcje
brak
