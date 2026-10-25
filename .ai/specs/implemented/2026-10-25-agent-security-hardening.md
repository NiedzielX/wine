---
status: implemented     # zatwierdzone przez właściciela (Filip) w czacie 2026-10-25: akceptacja planu faz 0–7 i bramek G0–G5
created: 2026-10-25
owner: Filip
related: [.ai/runs/2026-10-25-agent-security-hardening.md, .ai/lessons/2026-10-25-recommended-decision-default.md]
superseded_by:
---

# Utwardzenie warsztatu agenta AI (lekcja 9: bezpieczeństwo narzędzi)

## Problem
Agenci AI pracują w tym repozytorium autonomicznie (`om-auto-*`, logi w `.ai/runs/`), a repo nie ma twardych granic dla agenta. Audyt z 2026-10-25 (tylko odczyt) wykazał:

- brak `.claude/settings.json`: nie ma reguł `deny` na pliki z sekretami, sandboxa ani żadnego hooka;
- `.gitignore` obejmuje tylko `.env` i `.env.local` (nie `.env.production`, `.env.test`, kluczy, certyfikatów);
- CI nie skanuje sekretów (jest `audit:gate` dla zależności, ale nie dla sekretów);
- brak `CODEOWNERS`, więc zmiana konfiguracji agenta nie jest wyróżniona w review;
- brak dokumentu opisującego uprawnienia agenta, skille, serwery MCP i wynik próby prompt injection.

Zostało sprawdzone i jest w porządku: brak `.mcp.json`, brak hooków i `enableAllProjectMcpServers`; 42 skille z jednego źródła (`open-mercato/skills`) z hashami w `skills-lock.json`, bez dynamicznego kontekstu (`!` z komendą) i bez ukrytych znaków; brak realnych sekretów w repo (14 trafień wzorca connection stringu to adresy testowe localhost i przykłady); `permissions: contents: read` w CI; ochrona `main` (5 wymaganych checków, `strict`, `enforce_admins`, bez force-push); szerokie testy uprawnień i izolacji restauracji.

W każdym przebiegu agenta musi brakować jednej z trzech nóg *lethal trifecta*: dostępu do danych prywatnych, kontaktu z niezaufaną treścią albo wyjścia na zewnątrz. Dziś konfiguracja nie wymusza braku żadnej z nich.

## Cel i zakres
Wymuszone konfiguracją granice dla agenta (odczyt sekretów, hook blokujący, gotowy sandbox), skan sekretów w CI i dokument `security-notes.md`.

**Poza zakresem:**
- wybór i wdrożenie menedżera sekretów (decyzja właściciela; poziom 2 z lekcji);
- wymuszanie „Require review from Code Owners” w ochronie gałęzi: repo ma jednego opiekuna, a autor PR nie może zatwierdzić własnej zmiany, więc przy `enforce_admins` zablokowałoby to każdy merge. `CODEOWNERS` powstaje jako oznaczenie, wymuszenie wraca, gdy dojdzie druga osoba;
- zakaz edycji `.claude/settings.json` i hooków przez agenta (`Edit` w `deny`): koliduje z legalną pracą nad konfiguracją i z `/sandbox`, które zapisuje do `settings.local.json`; możliwy osobny krok, jeśli właściciel zechce;
- zmiana modelu lub harnessu, skan Snyk Agent Scan (wymaga konta), rotacja kluczy właściciela spoza tego środowiska.

## Wymagania
- **R1** `.claude/settings.json` (commitowany, z `$schema`) ma `permissions.deny` na odczyt: `**/.env`, `**/.env.local`, `**/.env.development`, `**/.env.production`, `**/.env.staging`, `**/.env.test`, `**/.env.*.local`, `~/.ssh/**`, `~/.aws/**`, `~/.config/gh/**`. **`.env.example` i `.env.template` pozostają czytelne**: `deny` wygrywa z `allow` bez wyjątków, więc lista jest wyliczona, a nie wzorcem `.env.*`. `permissions.deny` blokuje wbudowane narzędzia plikowe Claude Code, **nie** komendy basha (`cat .env`): tę lukę zamyka hook (R3) i sandbox (R2), co `security-notes.md` mówi wprost.
- **R2** Sekcja `sandbox` w tym samym pliku, **gotowa, ale domyślnie wyłączona** (`enabled: false`). Powód: sesje chmurowe tego projektu kierują ruch HTTPS przez lokalny proxy `127.0.0.1`, a na Linuksie `localhost` w sandboxie jest prywatny, więc włączony sandbox mógłby odciąć `git`, `gh` i `npm` w sesji, której nie da się tu przetestować (brak `bubblewrap` i `socat`). Lokalnie właściciel włącza go jednym kluczem (`/sandbox` zapisuje do `.claude/settings.local.json`, albo `"enabled": true` w pliku) i potwierdza komendami z lekcji. Pozostałe klucze (nazwy z dokumentacji sandboxingu): `allowUnsandboxedCommands: false`, `failIfUnavailable: false`, `filesystem.denyRead` dla `~/.ssh`, `~/.aws`, `~/.config/gh`, `~/.kube`, `~/.npmrc`, `~/.pypirc`, `network.allowedDomains`: `github.com`, `api.github.com`, `codeload.github.com`, `objects.githubusercontent.com`, `registry.npmjs.org`; `network.deniedDomains`: `169.254.169.254`, `metadata.google.internal`; `excludedCommands` (komendy łączące się z lokalnymi serwerami lub Dockerem, które w sandboxie nie zadziałają): `npm run test:db`, `npm run test:db *`, `npm run test:e2e`, `npm run test:e2e *`, `npm run smoke *`, `npm run boot:check`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `npm run start`.
- **R3** Hook `PreToolUse` z matcherem `Bash` uruchamia skrypt **Node** `.claude/hooks/pre-tool-use.mjs` (komenda: `node "$CLAUDE_PROJECT_DIR"/.claude/hooks/pre-tool-use.mjs`; bez `jq`, zgodnie z AGENTS §1.5). Skrypt czyta JSON ze stdin, rozbija `tool_input.command` na proste polecenia (separatory `;`, `&&`, `||`, `|`, nowa linia, `$(`, backtick) i tokeny z uwzględnieniem cudzysłowów oraz odrzuca prefiksy (`sudo`, `command`, `env`, `nohup`, `time`, `xargs`, `\`, ścieżka do binarki). Tekst argumentów `-m`/`--message`/`--body`/`--title` w `git` i `gh` jest traktowany jako opis, nie jako polecenie. Treść `bash -c`, `sh -c`, `eval` jest analizowana rekurencyjnie (jedna głębia). Kod **2** z komunikatem na stderr, gdy:
  1. pobrane z sieci trafia do interpretera (`curl`/`wget` → `sh`, `bash`, `zsh`, `python`, `node` przez pipe, `bash <(curl …)`, `sh -c "$(curl …)"`);
  2. `rm` z flagą rekursywną (`-r`, `-R`, `--recursive`, także sklejoną lub rozdzieloną: `-rf`, `-fR`, `-r -f`), **chyba że** wszystkie cele to dokładnie `node_modules`, `.next`, `dist`, `coverage`, `test-results`, `storybook-static` lub ich podkatalogi, bez `..`, `*` i `$`;
  3. którykolwiek token odwołuje się do `.ssh`, `.aws` lub `.config/gh` w `~`, `$HOME`, `${HOME}`, `/root`, `/home/<użytkownik>`;
  4. polecenie czytające lub kopiujące pliki (`cat`, `less`, `more`, `head`, `tail`, `grep`, `rg`, `awk`, `sed`, `cp`, `mv`, `base64`, `xxd`, `od`, `strings`, `source`, `.`, `bat`, `nl`, `tac`, `cut`, `sort`, przekierowanie `<` i `$(<…)`) ma za argument ścieżkę, której nazwa pliku to `.env` albo `.env.<sufiks>` inny niż dokładnie `example` i `template`; oraz `printenv` lub `env` bez polecenia (zrzut środowiska);
  5. `git push` z `--force`, `-f` (także w sklejonej fladze krótkiej), refspekiem zaczynającym się od `+` lub `--mirror` (dozwolone `--force-with-lease`, `--force-if-includes`);
  6. `gh repo delete` (także z flagami przed podkomendą).
  Każda ścieżka błędu kończy się kodem 2 (nieczytelny JSON, brak lub nie-tekstowa `tool_input.command`); pusta komenda daje 0. Komunikat blokady mówi, żeby nie obchodzić blokady innymi komendami. Hook nie zastępuje sandboxa: obejścia (np. `python -c`, `find -exec`, `perl`) są znaną luką.
- **R4** Testy w `packages/testkit/tests/agent-guardrails.test.ts` (to świadome rozszerzenie zakresu `testkit/tests`, zapisane w AGENTS §7): tabela komend przez stdin hooka (nigdy nie wykonują komend), w tym po co najmniej 2 warianty na każdą regułę R3 i przypadki dozwolone; błędne wejście (pusty stdin, nieczytelny JSON, `command` nie-tekst) daje 2; `settings.json` jest poprawnym JSON-em, ma reguły `deny` z R1 i **nie** zawiera `**/.env.example`, `**/.env.template` ani `**/.env.*`; ma sekcję `sandbox` z R2 i `enabled: false`; nie ma `enableAllProjectMcpServers`; komenda hooka wskazuje na istniejący plik (zmienna `$CLAUDE_PROJECT_DIR` podstawiana w teście, ścieżki liczone od korzenia repo przez `import.meta.url`); `excludedCommands` obejmuje komendy z AGENTS §1.5, które łączą się z bazą lub lokalnym serwerem; w repo nie ma `.mcp.json`.
- **R5** `.github/CODEOWNERS` z właścicielem `@NiedzielX` dla `/.claude/`, `/.mcp.json`, `/.agents/`, `/skills-lock.json`, `/AGENTS.md`, `/CLAUDE.md`, `/.github/`, `/scripts/`, `/security-notes.md`.
- **R6** `.gitignore` dodaje: `.env.*` z wyjątkami `!.env.example` i `!.env.template`, `*.pem`, `*.key`, `id_rsa*`. Żaden plik śledzony nie może zostać przez to zignorowany.
- **R7** Skan sekretów bez zewnętrznych zależności: `scripts/secret-scan.mjs` (Node, wypisuje przez `process.stdout`/`stderr`), `npm run secrets:scan`, job `secrets` w `.github/workflows/ci.yml` (`actions/checkout@v4`, `actions/setup-node@v4`, bez `npm ci`, `permissions: contents: read`). Tryb repozytorium: `git ls-files -z`; tryb testowy: `--root <katalog>` (przejście po katalogu bez `node_modules` i `.git`). Pomija symlinki, katalogi, pliki nieistniejące, binarne (bajt NUL w pierwszych 8 KB) i większe niż 1 MB. Wzorce: connection string z hasłem, `sk-ant-` (≥ 20 znaków), tokeny GitHub (`ghp_`, `gho_`, `ghs_` + ≥ 30 znaków, `github_pat_` + ≥ 20), `AKIA` + 16 znaków `[A-Z2-7]`, JWT (trzy segmenty po ≥ 10 znaków), blok prywatnego klucza. Allowlista `scripts/secret-scan.allowlist.json`: lista wpisów `{ "file", "pattern", "valueSha256", "reason" }` (klucz po pliku, wzorcu i skrócie SHA-256 wartości, nie po numerze linii); skaner zgłasza też wpisy nieużywane. Kod 1 przy trafieniu poza listą; wypisuje plik, numer linii i nazwę wzorca, **nigdy wartości** (także w komunikatach błędów). Skan obejmuje tylko `HEAD`, nie historię. Przed zdefiniowaniem allowlisty skaner jest uruchamiany na repo, a liczba trafień zapisana w logu przebiegu.
- **R8** `security-notes.md` w korzeniu repo: lista uprawnień agenta (`deny`, hook, narzędzia), skille i serwery MCP, wynik skanu sesji (liczby, bez wartości), data, opis ładunku i zaobserwowane zachowanie próby prompt injection (faza 4) z odnośnikiem do logu, znane obejścia hooka, jedno zdanie o tym, którą nogę trifekty odcinamy i w której ścieżce, jak włączyć sandbox lokalnie (wymaga `bubblewrap` i `socat` na Linuksie/WSL2; native Windows działa bez sandboxa) i dlaczego nie jest domyślnie włączony, oraz co właściciel ma zrobić u siebie (skan `~/.claude/projects/`, rotacja, test sandboxa przez `/sandbox`).
- **R9** `AGENTS.md`: nowa sekcja 9 „Bezpieczeństwo agentów”, wiersz `npm run secrets:scan` w tabeli §1.5, doprecyzowanie `testkit/tests` w §7; zaktualizowany komentarz z listą jobów w `ci.yml`. Lekcja w `.ai/lessons/`.
- **R10** Po pierwszym przebiegu jobu `secrets` na `main` właściciel (uprawnienie admin) dodaje jego nazwę do `required_status_checks.contexts` ochrony gałęzi. Dodanie przed pierwszym przebiegiem zablokowałoby wszystkie otwarte PR-y.

## Kryteria akceptacji
- [x] AC1 (R1) Test `agent-guardrails` potwierdza reguły `deny` z R1 i brak `.env.example`, `.env.template` na liście.
- [x] AC2a (R2) Test potwierdza klucze sandboxa, `excludedCommands` i `enabled: false`.
- [x] AC2b (R8) `security-notes.md` zawiera słowa „bubblewrap”, „socat” i wyjaśnienie, dlaczego sandbox nie jest domyślnie włączony (sprawdzone grepem w teście).
- [x] AC3 (R3) Tabela komend w teście. Zablokowane (kod 2), po co najmniej dwa warianty na regułę: `curl x | sh`, `wget -qO- x | bash`, `bash <(curl -s x)`, `rm -rf docs`, `rm -r -f docs`, `sudo rm --recursive x`, `/bin/rm -fR x`, `bash -c "rm -rf x"`, `cat ~/.ssh/config`, `cat "$HOME"/.aws/credentials`, `cat .env`, `cat ../.env`, `cat packages/app/.env.local`, `head .env.production`, `source .env`, `grep KEY .env`, `cp .env /tmp/x`, `cat < .env`, `cat .env.example.local`, `printenv`, `git push --force`, `git push -f origin x`, `git push origin +main`, `git push --mirror`, `gh repo delete x`, `gh -R x repo delete`. Przepuszczone (kod 0): `ls -la`, `cat .env.example`, `cat .env.template`, `rm -rf node_modules .next dist coverage`, `grep -rn '\.env' docs`, `git commit -m "usuń .env z docs"`, `git push --force-with-lease`, `git push -u origin fix-f`, `npm run db:seed`, `gh api repos/x/y/pulls`. Błędne wejście (pusty stdin, zły JSON, `command` nie-tekst) daje 2; pusta komenda daje 0.
- [x] AC4 (R4) `npm test -w @wine-match/testkit` przechodzi lokalnie i w CI (job `unit`); `npm run lint` bez błędów.
- [x] AC5 (R5) `.github/CODEOWNERS` istnieje i zawiera ścieżki z R5; po wypchnięciu `gh api repos/NiedzielX/wine/codeowners/errors` nie zwraca błędów składni.
- [x] AC6 (R6) `git check-ignore -v` potwierdza `.env.production`, `.env.test`, `x.pem` i `x.key` jako ignorowane, a `.env.example` i `.env.template` nie są; `git ls-files -ci --exclude-standard` jest puste.
- [x] AC7 (R7) `npm run secrets:scan` na repo kończy się kodem 0 (po allowliście, z zapisaną liczbą trafień przed nią); test na katalogu tymczasowym z próbkami zbudowanymi dynamicznie kończy się kodem 1, a stdout i stderr nie zawierają próbki; wpis nieużywany w allowliście jest zgłaszany; job `secrets` jest zielony w PR.
- [x] AC8 (R8) `security-notes.md` zawiera wszystkie sekcje z R8; wynik próby prompt injection ma datę, opis ładunku, zaobserwowane zachowanie i odnośnik do logu w `.ai/runs/`.
- [x] AC9 (R9) Sekcja 9, wiersz w §1.5, zmiana §7 w `AGENTS.md`, lekcja i wpis w `.ai/lessons.md`; nazwy plików zgodne z `YYYY-MM-DD-slug.md`.
- [x] AC10 (R10) Po merge i pierwszym przebiegu na `main`: `gh api repos/NiedzielX/wine/branches/main/protection` zawiera `secrets` w `required_status_checks.contexts`.

## Projekt rozwiązania
Pliki do utworzenia: `.claude/settings.json`, `.claude/hooks/pre-tool-use.mjs`, `.github/CODEOWNERS`, `scripts/secret-scan.mjs`, `scripts/secret-scan.allowlist.json`, `packages/testkit/tests/agent-guardrails.test.ts`, `packages/testkit/tests/secret-scan.test.ts`, `security-notes.md`, lekcja i log. Pliki do zmiany: `.gitignore`, `package.json` (skrypt `secrets:scan`), `.github/workflows/ci.yml` (job `secrets`, komentarz z listą jobów), `AGENTS.md` (§1.5, §7, §9), `.ai/lessons.md`.

Kolejność: (0) skaner uruchomiony na repo, liczba trafień do logu; (1) tabela komend i test hooka (pada), (2) hook, (3) `settings.json`, (4) test ustawień, (5) skaner i jego testy, (6) job w CI, (7) `.gitignore`, `CODEOWNERS`, (8) dokumenty. Dwa PR-y: PR 1 „agent” (R1–R6), PR 2 „CI i dokumentacja” (R7–R9). Weryfikacja zgodnie z AGENTS §6.1 (`lint`, `typecheck`, `test`, `build`); `test:db` nie jest potrzebny (brak zmian w `db` i serwisach).

`.claude/settings.json` jest ładowany do sesji agenta, więc powstaje i jest testowany w osobnym worktree, a powłoka sesji nie zmienia katalogu głównego na worktree. Testy hooka nigdy nie wykonują komend z tabeli: przekazują je tylko jako dane na stdin hooka.

## Przegląd niezależny (2026-10-25, pod-agent w świeżym kontekście)
Przyjęte: hook w Node zamiast `bash` + `jq` (AGENTS §1.5, brak zależności, zawodzenie zamykające bez `jq`), parsowanie komendy na tokeny z wyjątkami dla opisów, normalizacja prefiksów, wyjątek dla czyszczenia katalogów budowania, przypadki dozwolone w tabeli, format allowlisty z hashem, tryb `--root` skanera, symlinki, pliki binarne, `-z`, kompletniejsza lista `excludedCommands`, `.env.template` w R1 i R6, `git ls-files -ci` w AC6, rozbicie AC2 i doprecyzowanie AC8, uwagi o `permissions.deny` kontra komendy basha, wiersz `secrets:scan` w §1.5.
Odrzucone lub odłożone: `Edit` w `deny` dla `.claude/` (poza zakresem, zob. wyżej), przeniesienie `security-notes.md` do `docs/` (zostaje w korzeniu, zgodnie z nazwą z kursu), zakaz `allowUnsandboxedCommands: true` (zostaje `false` jak w lekcji; brakującą komendę dopisuje się do `excludedCommands`).

## Ryzyka i otwarte pytania
- **Sandbox nie został uruchomiony w żywym Claude Code** (brak `bubblewrap`, `socat` i interaktywnego agenta), dlatego jest wyłączony domyślnie. Konfiguracja pochodzi z dokumentacji i jest sprawdzana strukturalnie; lista `allowedDomains` i `excludedCommands` wymaga weryfikacji przez `npm ci && npm run build && npm test` w sandboxie, zanim ktoś go włączy.
- **Hook jest niekompletny z założenia:** blokuje tekst komendy, nie intencję agenta. Obejścia (np. `python -c`, `perl`, `find -exec`, skrypt wywołany przez `npm run`) są zapisane w `security-notes.md` jako znane luki.
- `permissions.deny` nie chroni przed `cat` w Bashu; chroni narzędzia plikowe. Sandbox i hook uzupełniają tę lukę, ale tylko w opisanych granicach.
- W sesjach, w których sandbox nie działa (Windows natywny, brak `bubblewrap`, wyłączony), jedyną ochroną jest `permissions.deny` i hook.
- `excludedCommands` uruchamia wskazane komendy bez sandboxa; wzorce dopasowują tekst komendy, więc wariant `cd x && npm run test:db` może nie pasować.
- Wymuszenie Code Owners odłożone (jeden opiekun repo); wraca przy drugiej osobie.
- Skaner sekretów skanuje tylko `HEAD`: wyciek w starym commicie wymaga osobnego skanu historii i rotacji.

## Realizacja
- Gałąź `chore/agent-security-hardening`, log `.ai/runs/2026-10-25-agent-security-hardening.md`, lekcja `.ai/lessons/2026-10-25-agent-config-in-repo.md`. Zrobione R1–R9; AC1–AC4 i AC6–AC9 spełnione (testy, `lint`, `typecheck`, `test`, `build`, `secrets:scan`). AC5 (`codeowners/errors` bez błędów) i AC10 (job `secrets` w wymaganych checkach `main`, dodany przez właściciela 2026-10-25) spełnione po merge #94. Odstępstwa: sandbox domyślnie wyłączony, „Require Code Owners” nie włączone (jedyny maintainer), jeden PR zamiast dwóch.
- Odstępstwa od projektu: (1) jeden PR zamiast dwóch (test `agent-guardrails` czyta `security-notes.md`); (2) „Require review from Code Owners” nie włączone (jeden opiekun repo, zob. „Poza zakresem”); (3) sandbox gotowy, ale wyłączony, z powodu proxy `127.0.0.1` w sesjach chmurowych i prywatnego `localhost` na Linuksie (R2).
- Liczba trafień skanera przed allowlistą: 16 (13 wpisów w allowliście).
