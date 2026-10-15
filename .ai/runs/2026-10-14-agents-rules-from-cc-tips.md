---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: brak — zmiana procesu, nie funkcji produktu
outcome: success
related: [.ai/runs/2026-10-14-ai-workflow-structure.md]
---

# Dopisanie do AGENTS.md zasad z 10 wskazówek Borisa Cherny’ego o Claude Code

## Zadanie
Wybrać wskazówki przydatne w projekcie (szczególnie planowanie, weryfikacja, wnioski po poprawkach), dopisać je zwięźle do AGENTS.md bez duplikatów i potwierdzić, że CLAUDE.md wczytuje @AGENTS.md.

## Przebieg
1. Pobrano streszczenie: https://ykdojo.github.io/claude-code-tips/content/boris-claude-code-tips
2. Przyjęte: #1 praca równoległa (worktree), #2 plan mode i re-planowanie, #3 aktualizacja reguł po każdej poprawce, #4 skrypty/komendy dla powtarzalnych czynności, #5 samodzielne naprawianie błędów, #6 krytyczny przegląd i „eleganckie rozwiązanie”, szczegółowe specyfikacje, #8 pod-agenci.
3. Odrzucone: #7 (konfiguracja terminala), #9 (analityka SQL), #10 (styl nauki) — nie dotyczą procesu w repozytorium.
4. Zasady wplecione w istniejące sekcje: §3 reguła 4 (wyzwalacze powrotu do planowania) i podsekcja „Planowanie złożonych zadań”; §5 (lekcja od razu po poprawce, awans lekcji do reguł, pole `promoted` w szablonie); §6 krok 5 → nowa §6.1 „Weryfikacja zmian”; nowa §8 (równoległość, pod-agenci, powtarzalne czynności).
5. CLAUDE.md: `@AGENTS.md` był już w linii 3; zaktualizowano punkt weryfikacji (odwołanie do §6.1) i sekcję Claude Code (plan mode, pod-agenci, `.claude/commands/`), żeby nie rozjeżdżała się z AGENTS.md.

## Weryfikacja
- `CLAUDE.md` linia 3: `@AGENTS.md` (poza blokiem kodu).
- Odwołania do sekcji (§3, §5, §6.1, §7, §8) sprawdzone względem nagłówków AGENTS.md.
- Nazwy plików w `.ai/` zgodne z `YYYY-MM-DD-slug.md`. Kod aplikacji nie był zmieniany.

## Wynik
Zasady dodane. Kandydat na automatyzację (wg nowej §8): skrypt `npm run engine:matrix` z lekcji kalibracji — nie wdrożony, poza zakresem tego zadania.

## Lekcje
Brak.
