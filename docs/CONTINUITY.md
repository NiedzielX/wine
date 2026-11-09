# Ciągłość pracy: gdy model, dostawca albo budżet są niedostępne

Wine Match jest rozwijany z udziałem agentów AI, ale **nie zależy od nich w działaniu**: aplikacja to zwykły kod TypeScript, dane są w PostgreSQL, a proces pracy jest zapisany w plikach repozytorium. Ten dokument mówi, co zrobić, gdy agent, model, dostawca narzędzia albo budżet zniknie w środku pracy, oraz jak właściciel obsługuje i naprawia system **bez agentów**. Wdrożenie, kopie i wycofanie: `docs/DEPLOYMENT.md`. Monitoring i alerty: `docs/OPERATIONS.md`.

## 1. Gdzie jest prawda (nic nie żyje tylko w rozmowie z agentem)

| Co | Gdzie | Uwagi |
|---|---|---|
| Kod i historia | repozytorium git: `main`, gałęzie `feat/*`, `fix/*`, `chore/*`, otwarte PR-y | gałąź jest punktem wznowienia; PR niesie plan i opis |
| Zasady pracy (dla każdego agenta i człowieka) | `AGENTS.md` | **agentowo-neutralny**: `CLAUDE.md` tylko go importuje; Codex, Cursor, Copilot, Aider czytają `AGENTS.md` bezpośrednio |
| Specyfikacje i ich status | `.ai/specs/` (`approved`, `in-progress`), `implemented/`, `archive/` | sekcja „Realizacja” i pola AC mówią, co jest zrobione; zatwierdza tylko człowiek |
| Dzienniki przebiegów | `.ai/runs/YYYY-MM-DD-slug.md` | każdy autonomiczny przebieg zostawia ślad także przerwany (`ended` puste, `outcome: partial` lub `aborted`) |
| Lekcje | `.ai/lessons.md` + `.ai/lessons/` | pamięć długoterminowa; czytana na początku każdej sesji |
| Kolejność i limity pracy | `.ai/docs/parallel-work.md` | typy zadań, limit 3 PR-ów w review |
| Polecenia i bramki | `.ai/docs/commands.md`, `package.json`, `.github/workflows/ci.yml` | wszystko, co robi agent, da się uruchomić ręcznie |
| Decyzje produktowe | `.ai/specs/product-brief.md`, specyfikacje, `docs/` | |
| Stan produkcji | `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, logi i metryki | |
| Pamięć narzędzia (np. „memory” Claude) | **nie jest źródłem prawdy** | trwałe ustalenia idą do `.ai/lessons/` (`CLAUDE.md`) |

## 2. Wznowienie pracy po przerwie (inny agent, inna maszyna, później)

1. `git fetch --all --prune`; `git branch -a` i `gh pr list` (albo lista PR-ów na GitHubie) pokazują, co jest w toku. Praca bez PR-a jest na gałęzi `feat/…` lokalnie (`git worktree list`) albo, jeśli nie została wypchnięta, tylko na tej maszynie: sprawdź worktree w `.claude/worktrees/`.
2. Przeczytaj w kolejności: `AGENTS.md` → `.ai/lessons.md` → najnowsze logi w `.ai/runs/` (ostatni plik dotyczący tej samej specyfikacji; pole `related`) → specyfikację (sekcje Wymagania, Kryteria akceptacji, Realizacja).
3. Ustal, co jest zrobione: `git log main..<gałąź> --oneline`, `git diff main --stat`, pola AC w specyfikacji, sekcja „Wynik” i „Weryfikacja” w logu. Niezaznaczone AC nie znaczy niezaimplementowane: uruchom test, zanim zaplanujesz „domknięcie” (lekcja 2026-11-05).
4. Wznowienie = **nowy log** w `.ai/runs/` z `related: [poprzedni log]` (logów innych przebiegów się nie edytuje; `AGENTS.md` §4), nowa gałąź albo ta sama za zgodą właściciela.
5. Uruchom bramkę: `npm ci && npm run lint && npm run typecheck && npm test && npm run build`. Zielona bramka na gałęzi jest dowodem, od którego się zaczyna; czerwona to pierwsza rzecz do wyjaśnienia.
6. Worktree usunięty lub brak pracy lokalnie: jeśli commity nie były wypchnięte, nie da się ich odtworzyć; zacznij od specyfikacji i logu, nie zgaduj. Dlatego **wypychaj gałąź po każdej fazie** (przy aktywnej pracy właściciel decyduje o PR, ale gałąź zdalna chroni przed utratą).

## 3. Co jest zależne od dostawcy, a co nie

| Element | Zależność | Zamiennik |
|---|---|---|
| `AGENTS.md`, `.ai/**`, `docs/**`, `SDLC.md`, `CODE_REVIEW.md` | brak (Markdown) | działają w każdym narzędziu |
| `CLAUDE.md`, `packages/*/CLAUDE.md` | Claude Code (tylko import `AGENTS.md`) | inne narzędzia czytają `AGENTS.md` wprost; w razie potrzeby skopiuj treść do pliku wymaganego przez to narzędzie |
| `.claude/settings.json` (`permissions.deny`, `sandbox`, `hooks`) i hook `.claude/hooks/pre-tool-use.mjs` | **Claude Code** (blokada odczytu sekretów, `rm -r`, `git push --force`) | w innym harnessie powtórz te reguły jego mechanizmem (lista zakazów w `security-notes.md` §2); do czasu tego **nie dawaj agentowi dostępu do sekretów ani do `git push --force`**; skan `npm run secrets:scan` i CI działają niezależnie |
| `.claude/skills/*` (dowiązania do `.agents/skills`), skille `om-auto-*`, `om-*` | format skilli Claude Code (pliki Markdown w `.agents/skills`, źródło `open-mercato/skills`, hashe w `skills-lock.json`) | czytelne jako instrukcje także dla innych agentów: podaj agentowi `SKILL.md` jako zadanie; wymagają `gh` i `git`, nie konkretnego modelu |
| `.claude/commands/` (gdy istnieje) | Claude Code | to samo polecenie jest skryptem `npm run …` albo plikiem Markdown |
| Sesje zdalne, rutyna nocnego review (`.ai/docs/nightly-review-routine.md`) | planowanie po stronie dostawcy | można zastąpić `cron` + dowolnym agentem uruchomionym według tego pliku, albo robić review ręcznie wg `.ai/docs/review-protocol.md` |
| `npm run review:pack`, `verify:regression`, `check:*`, `secrets:scan`, `audit:gate` | brak (Node) | uruchamia człowiek lub CI |
| CI (`.github/workflows/ci.yml`), GitHub (PR, labele) | GitHub | repozytorium jest zwykłym git: te same polecenia da się uruchomić lokalnie |

## 4. Gdy model albo dostawca jest niedostępny

1. **Nie wstrzymuj produkcji.** Aplikacja nie wywołuje żadnego API LLM w normalnym działaniu (silnik jest deterministyczny, `AGENTS.md` §7); awaria dostawcy AI nie wpływa na działanie ani na naprawy operacyjne z sekcji 6.
2. **Zmiana harnessu.** Dowolny agent kodujący (Codex CLI, Cursor, Aider, Copilot, kolejny model) wystarczy, jeśli: czyta `AGENTS.md` i `.ai/lessons.md`; pracuje w osobnym `git worktree` na osobnej gałęzi; uruchamia te same polecenia bramki; zostawia log w `.ai/runs/`; nie ma dostępu do sekretów i zachowuje regułę „brakuje jednej z trzech nóg” (`AGENTS.md` §9; powtórz reguły `deny` i hooka jego mechanizmem, sekcja 3).
3. **Modele o otwartych wagach** (uruchamiane lokalnie) nadają się do zadań typu M i do małych, dobrze opisanych zmian (jedna funkcja, test, dokumentacja); zasady są te same, ale: skracaj zadania do jednej specyfikacji i jednej fazy, **zawsze** uruchamiaj całą bramkę (`lint`, `typecheck`, `npm test`, `build`, przy bazie `test:db`), nie ufaj stwierdzeniu „działa” bez wyniku polecenia, a zmiany w obszarach `risk-high` (autoryzacja, tenant, płatności) zostaw do przeglądu człowieka lub mocniejszego modelu. Nie ma wymogu konkretnego dostawcy w kodzie.
4. **Przegląd** (`CODE_REVIEW.md`, `.ai/docs/review-protocol.md`) robi inna sesja bez kontekstu autora; gdy brak drugiego modelu, użyj listy kontrolnej `.ai/docs/review-checklists.md` i `npm run review:pack` ręcznie.
5. **Skille nie działają:** wykonaj kroki z `SKILL.md` ręcznie; to zwykła lista czynności (worktree, bramka, PR).
6. Po powrocie dostawcy: zapisz w `.ai/runs/` co zrobiono innym narzędziem, żeby następna sesja wiedziała.

## 5. Budżet i dyscyplina równoległości (ochrona przed „spaleniem” limitu)

Zasady z `.ai/docs/parallel-work.md` obowiązują także jako **budżet**: więcej agentów nie skraca drogi do wydania, a zużywa limit szybciej niż praca da się przejrzeć.

- **Limit współbieżnych agentów implementacyjnych: 3** (równy limitowi PR-ów w review). Zadania typu M (research, review, triage) w tle liczą się osobno, ale nie więcej niż 2 naraz, gdy budżet jest ograniczony.
- **Jeden worktree = jedna specyfikacja = jeden PR.** Nie uruchamiaj agenta „na wszystko”; zlecaj jedną fazę.
- **Ogranicz czas sesji:** jedna faza lub jedno zadanie na sesję, z opisanym końcem (które AC, które polecenia mają być zielone). Sesja bez postępu po dwóch próbach naprawy tego samego problemu **zatrzymuje się i wraca do planowania** (`AGENTS.md` §3, reguła 4), zamiast spalać budżet.
- **Przyrostowo, nie hurtem:** małe PR-y fazami, bramka po każdej fazie, commit i wypchnięcie gałęzi po każdej fazie (punkt odzyskania, sekcja 2). Przerwana sesja traci wtedy najwyżej ostatnią fazę.
- **Tanie narzędzia najpierw:** `npm run lint`, `typecheck`, testy jednostkowe i `check:*` są darmowe w tokenach; pod-agentów (kosztują okno kontekstu od zera, `AGENTS.md` §8) używaj do researchu, review i prac równoległych, nie do jednoplikowych zmian.
- **Gdy budżet się kończy:** dokończ bieżącą fazę do stanu zielonej bramki albo zostaw gałąź z logiem (`outcome: partial`, w „Wynik” lista otwartych punktów) i **nie zaczynaj kolejnej fazy**. Lepiej zostawić jeden skończony PR niż trzy przerwane.
- **Przeglądy właściciela w blokach czasu** (nie ciągłe przełączanie); pytania do właściciela partiami (parallel-work §1, pkt 6).

## 6. Jak właściciel obsługuje i naprawia system bez agentów

Wystarczą: terminal, Docker, `git`, `psql`/`docker compose`, przeglądarka. Poniższe polecenia nie wymagają żadnego agenta.

**Codzienna obsługa (produkcja)**

| Potrzeba | Polecenie / dokument |
|---|---|
| Czy działa? | `curl -fsS -H 'X-Wine-Match-Synthetic: 1' https://<domena>/api/v1/health` (200); `docker compose ps` |
| Logi | `docker compose logs --tail 200 app` (JSON, sekrety zredagowane); objawy i alerty: `docs/OPERATIONS.md` |
| Metryki | `GET /api/v1/metrics` z `Authorization: Bearer <METRICS_TOKEN>` |
| Weryfikacja instalacji | `npm run smoke -- --production https://<domena> <slug>` (tylko GET) |
| Restart aplikacji | `docker compose restart app` (stan jest w PostgreSQL; sesje przeżywają) |
| Kopia bazy | `docs/DEPLOYMENT.md` sekcja 9; próba odtworzenia co kwartał |
| Nowa restauracja / konto | `docs/DEPLOYMENT.md` sekcja 7 (`restaurant:create`), zaproszenia w panelu |
| Aktualizacja | `docs/DEPLOYMENT.md` sekcja 11 |
| **Wycofanie** | `docs/DEPLOYMENT.md` sekcja 10 (poprzedni obraz, poprawka w przód, odtworzenie zrzutu; `migration:down` zabronione) |

**Naprawa kodu bez agenta**

1. `git checkout -b fix/<opis>`; `npm ci`. Zasady, które obowiązują także człowieka: `AGENTS.md` §1.3, §1.6, §7 oraz `.ai/docs/commands.md`.
2. Napisz test, który pada (reprodukcja), popraw, `npm run lint && npm run typecheck && npm test && npm run build`; przy bazie `npm run test:db` (testcontainers wymagają Dockera); przy zmianie API/ekranu `npm run test:e2e`.
3. `npm run secrets:scan`, opis PR wg `.github/pull_request_template.md`, review innej osoby lub `npm run review:pack` i lista kontrolna.
4. Wdrożenie: tag git, `docs/DEPLOYMENT.md` sekcja 11.
5. Awaria produkcji, której nie umiesz naprawić: **wycofaj** (sekcja 10 runbooka), nie improwizuj w bazie. Dane zmieniaj wyłącznie po zrzucie.

**Co przejmuje człowiek, gdy nie ma agentów:** logi przebiegów (`.ai/runs/`) i lekcje (`.ai/lessons/`) dalej prowadzi się ręcznie według szablonów w `.ai/docs/process-templates.md`; nic w aplikacji ich nie wymaga.

## 7. Co jeszcze jest do decyzji właściciela

- Czy utrzymywać drugi harness (np. Codex lub Cursor) jako zapasowy i **raz na kwartał** wykonać na nim próbną fazę (sprawdzenie, że `AGENTS.md` wystarcza); do tego czasu zapasowy tryb jest opisany, ale nieprzetestowany.
- Miesięczny limit wydatków na agentów i kto go pilnuje (ten dokument daje tylko zasady dyscypliny, nie mierzy zużycia).
- Przeniesienie reguł `deny`/hooka do drugiego harnessu, gdy zostanie wybrany (sekcja 3).
