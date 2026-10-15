# CLAUDE.md

@AGENTS.md

Pełne zasady są w `AGENTS.md` (zaimportowany wyżej) i mają pierwszeństwo. Poniżej skrót, który Claude **musi** stosować w każdej sesji w tym repozytorium.

## Struktura `.ai/`

| Ścieżka | Przeznaczenie | Nazwa pliku |
|---|---|---|
| `.ai/specs/` | specyfikacje SDD aktywne (`draft`, `approved`, `in-progress`) | `YYYY-MM-DD-slug.md` |
| `.ai/specs/implemented/` | specyfikacje zrealizowane | bez zmiany nazwy |
| `.ai/specs/archive/` | specyfikacje porzucone lub zastąpione | bez zmiany nazwy |
| `.ai/runs/` | log każdego autonomicznego przebiegu | `YYYY-MM-DD-slug.md` |
| `.ai/lessons.md` | indeks lekcji, najnowsze na górze | — |
| `.ai/lessons/` | pełna treść lekcji | `YYYY-MM-DD-slug.md` |

Slug: małe litery ASCII, cyfry, myślniki, bez polskich znaków. Data: dzień utworzenia, Europe/Warsaw.

## Obowiązkowo, w tej kolejności

1. **Start sesji:** przeczytaj `.ai/lessons.md` i lekcje związane z zadaniem.
2. **Przed zmianą funkcji, silnika, modelu danych lub API:** znajdź specyfikację w `.ai/specs/` (także `implemented/`). Brak → utwórz `draft` według szablonu z `AGENTS.md` i poproś o akceptację. **Nie implementuj draftów** — tylko `approved` / `in-progress`.
3. **Praca autonomiczna** (zmieniasz pliki lub uruchamiasz polecenia bez zatwierdzania każdego kroku): na początku załóż log w `.ai/runs/`, uzupełniaj go na bieżąco, na końcu ustaw `ended` i `outcome`. Nie edytuj cudzych logów.
4. **Weryfikacja:** według `AGENTS.md` §6.1 — minimum `npm run typecheck`, `npm test`, `npm run build`, a dla UI 390 px i 1440 px; dowody w logu.
5. **Lekcje:** po nieoczywistym błędzie, poprawce od człowieka, decyzji projektowej lub nowym sposobie pracy zapisz lekcję w `.ai/lessons/` i dopisz linię na górze `.ai/lessons.md`. Najpierw sprawdź, czy podobna nie istnieje — wtedy ją zaktualizuj.
6. **Zamknięcie specyfikacji:** po spełnieniu kryteriów akceptacji ustaw `status: implemented`, uzupełnij „Realizacja” i przenieś plik do `.ai/specs/implemented/` (`git mv`).
7. **Odpowiedź dla człowieka:** podaj ścieżki do specyfikacji, logu i nowych lekcji.

## Specyficzne dla Claude Code

- Każde zadanie wymagające specyfikacji zaczynaj w trybie planowania (Shift+Tab); gotowy plan zapisz jako specyfikację w `.ai/specs/`, a nie tylko w rozmowie. Gdy implementacja zbacza z planu (`AGENTS.md` §3, reguła 4), wróć do trybu planowania.
- Przegląd specyfikacji, eksplorację i weryfikację deleguj pod-agentom (Task), zgodnie z `AGENTS.md` §8. Dziedziczą te zasady; log prowadzi wyłącznie agent główny.
- Komendy dla powtarzalnych czynności zapisuj w `.claude/commands/` i commituj (`AGENTS.md` §8).
- Każdy pakiet w `packages/` ma `CLAUDE.md`, który importuje jego `AGENTS.md` — Claude Code wczytuje go automatycznie przy pracy w tym katalogu. Zasady architektury: `AGENTS.md` §1.
- Nie zapisuj ustaleń projektu wyłącznie w pamięci Claude (`#` / memory) — trwałe ustalenia projektu trafiają do `.ai/lessons/`, żeby widziały je też inne agenty i ludzie.
- Zanim uznasz pracę za skończoną, sprawdź, czy wszystkie nowe pliki w `.ai/` mają nazwy zgodne z `YYYY-MM-DD-slug.md`.
