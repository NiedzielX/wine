---
started: 2026-11-08 18:40
ended: 2026-11-08 19:30
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (zadanie narzędziowe lekcji 18, bez zmiany zachowania aplikacji)
outcome: success (zmiany zacommitowane lokalnie na gałęzi, bez pusha i bez PR; CI przy PR zweryfikuje to, czego nie dało się uruchomić lokalnie)
related: [.ai/lessons/2026-11-08-ci-supply-chain-pins.md, .ai/specs/implemented/2026-10-25-agent-security-hardening.md]
---

# Lekcja 18: łańcuch dostaw CI i uprawnienia agenta

## Zadanie
Przypiąć akcje SHA, ograniczyć uprawnienia jobów, wypisać narzędzia spoza lockfile'a, ocenić `ignore-scripts`, dodać artefakt pokrycia, utwardzić konfigurację i hook agenta, dodać skan historii sekretów.

## Przebieg i wyniki per punkt
1. **Akcje przypięte SHA** (zweryfikowane `gh api`): `actions/checkout` v4.4.0 `11d5960a…` (commit, 2026-07-16), `actions/setup-node` v7.1.0 `949feb24…` (commit, 2026-10-08), `actions/upload-artifact` v4.6.2 `ea165f8d…` (commit, 2025-03-19), `github/codeql-action` v4.39.1: tag adnotowany `8498dc4c…` rozwinięty do commita `9b325408…` (tag z 2026-10-21; `init` i `analyze` ten sam). Wszystkie starsze niż 14 dni. Każdy wiersz `uses:` ma `# vX.Y.Z` (sprawdzone grepem: 0 bez komentarza). `persist-credentials: false` na każdym checkoucie (żaden nie pushuje). `permissions: contents: read` jawnie w każdym z 8 jobów `ci.yml`; nazwy jobów bez zmian. Komentarz w `dependabot.yml`.
2. **Narzędzia poza lockfile'em:** `.ai/docs/commands.md` (sekcja „Narzędzia poza lockfile'em”), `security-notes.md` §11. Pakiety systemowe z `agent-browser install --with-deps` zostają **nieprzypięte** (jawnie opisane).
3. **`ignore-scripts=true`: włączone.** `hasInstallScript` w lockfile'u: `esbuild` (dev), `protobufjs`, `ssh2`, `cpu-features` (opcjonalny), `fsevents` (dev, opcjonalny). Dowód lokalny: `npm ci` (npm 11.20.0) z flagą, potem lint, typecheck, `npm test` (wszystkie pakiety), `build`, `boot:check` zielone. `agent-browser` 0.39.1 po instalacji z `--ignore-scripts` działa (`--version`; binarki są w paczce; sprawdzone na macOS), w CI flaga jest jawna w kroku instalacji.
4. **Pokrycie:** krok `upload-artifact` w jobie `unit` (`packages/*/coverage`, 7 dni, `!cancelled()`, bez progu).
5. **Uprawnienia agenta:** `permissions.ask` (klucz potwierdzony w schemacie `json.schemastore.org/claude-code-settings.json`) dla merge, pushu na `main`/`master`, wariantów force, `gh api` z metodą zapisu lub polami, `gh repo delete`/`edit`, `gh release`, `gh secret`/`variable` oraz `Edit` w `.claude/`, `.agents/`, `skills-lock.json`, `.github/CODEOWNERS` (ścieżki od korzenia projektu, żeby nie łapać edycji w worktree). Hook: wielkość liter w `.env`, magazyny poświadczeń (`~/.npmrc`, `~/.git-credentials`, gcloud, `~/.kube`, `~/.netrc`, `~/.pypirc`), komendy wypisujące poświadczenie, zrzut zmiennych (`export -p`, `declare -x`). Czerwone najpierw: 25 nowych przypadków padało, po zmianie 117/117 zielone, w tym 9 nowych przypadków „allowed” (brak nadmiernego blokowania) i test układu `settings.json`. Fail-closed i test ścieżki ze spacją bez zmian. `.gitignore`: `.claude/worktrees/`, `.claude/settings.local.json`. `security-notes.md`: hook to guardrail, nie granica.
6. **`--history`:** `scripts/secret-scan.mjs --history [--repo]`, `npm run secrets:scan:history`, 4 testy na tymczasowym repo (sekret usunięty później i tylko na innej gałęzi; czysta historia; allowlista; brak repozytorium), workflow `.github/workflows/secrets-history.yml` (tygodniowo, ręcznie, `fetch-depth: 0`, nie wymagany). Lokalnie na prawdziwej historii: 48 trafień, wszystkie `postgres-url` (placeholder w testach, specyfikacjach, logach; hosty zarezerwowane lub wewnętrzne; zweryfikowałem same hosty, nie wartości); 19 spoza `HEAD` w `scripts/secret-scan.history-allowlist.json`. Inne wzorce (tokeny GitHub, klucze Anthropic i AWS, JWT, klucze prywatne): 0.
7. Ustawienia tylko właściciela: poniżej.

## Poprawki po review (PR #135, 2026-11-09)
- **`npm rebuild` respektuje `ignore-scripts`** (sprawdzone npm 11.20.0 na lokalnym pakiecie ze skryptem `install`: `rebuild` nic nie uruchomił, `rebuild --ignore-scripts=false` uruchomił). Zalecenie poprawione w `.npmrc` (komentarz), `security-notes.md` §11, `commands.md`, lekcji.
- **`agent-browser`:** jego skrypt poinstalacyjny tylko `chmod`uje binarki (w paczce nie mają bitu wykonywalnego), pobiera brakującą i podmienia dowiązanie globalne; opakowanie `bin/agent-browser.js` samo poprawia bit przy starcie. Krok `e2e` robi teraz jawne `chmod +x` na binarkach Linux po instalacji `--ignore-scripts` (bez uruchamiania kodu dostawcy). Nadal sprawdzone tylko na macOS i deklaruje Node 24 przy Node 22: **job `e2e` obserwować przy pierwszym przebiegu.**
- **Hook:** wzorzec zmiennej z poświadczeniem wymaga, by nazwa KOŃCZYŁA się słowem (TOKEN, SECRET, PASSWORD, API_KEY, ACCESS_KEY, SECRET_KEY, PRIVATE_KEY, CREDENTIAL(S)); `echo $MAX_TOKENS` i `$TOKEN_FILE` przechodzą (nowe przypadki „allowed”). Udokumentowane: pojedyncze cudzysłowy nie odróżniane, wysłanie wartości w sieć (`curl -d`) poza zakresem; `printenv` i goły `env` były i są blokowane.
- **`--history`:** skip lockfile'a tylko dla ścieżki głównej (test: `sub/package-lock.json` jest skanowany); `ENOBUFS` ma własny komunikat; pominięcie commitów scalających (sekret wpisany tylko przy rozwiązywaniu konfliktu) udokumentowane w komentarzu funkcji.
- **`permissions.ask`:** `gh release`/`secret`/`variable` zawężone do poleceń zapisu (bez `list`/`view`), dodane `gh pr merge` bez argumentów, `git push … main --opcja`, refspec `:refs/heads/main`, `Edit(/.mcp.json)`. Skutki uboczne i luki (push bieżącej gałęzi bez nazwy, zapis przez powłokę, `.github/workflows/` celowo poza listą) opisane w `security-notes.md`. Samego tekstu recenzji nie miałem poza listą od koordynatora: jeśli zawierał inne luki, nie zostały uwzględnione.
- Wynik: testkit 296 (z 293), reszta bramki bez zmian i zielona.

## Weryfikacja
- `npm run lint`: czysto. `npm run typecheck`: bez błędów. `npm test`: core 743, db 84, ui 62, app 500, testkit 293 (z 252) zielone.
- `check:context` 0 błędów (11 ostrzeżeń sprzed zmiany), `check:qa`, `check:routes`, `secrets:scan` (21 trafień, 16 wpisów), `secrets:scan:history`, `audit:gate` (high 0, critical 0), `build` zielone.
- Składnia YAML sparsowana (`yaml`): `ci.yml` (8 jobów), `codeql.yml`, `secrets-history.yml`, `dependabot.yml`.

## Tylko w CI (nie dało się lokalnie)
- `database` i `e2e` (brak Dockera i `agent-browser` na tej maszynie) przy `ignore-scripts=true`, w tym `ssh2` bez natywnego dodatku w testcontainers i `agent-browser install --with-deps` na runnerze Linux.
- Nowe SHA akcji faktycznie się pobierają; krok `upload-artifact` dla `coverage`; `secrets-history.yml` po pierwszym ręcznym uruchomieniu (`workflow_dispatch`).
- Zachowanie `permissions.ask` w harnessie (składnia `Edit(/ścieżka)` i wzorce `Bash(… *)` wg dokumentacji; nie przetestowane w żywej sesji).

## Ryzyka
- `permissions.ask` zatrzyma autonomiczne przebiegi (`om-approve-merge-pr`, `gh api` z `-f` w skillach, edycje `.claude/`) do odpowiedzi człowieka; to zamierzone, ale spowalnia nocny przegląd w chmurze, jeśli ten nie ma trybu pomijającego pytania.
- `ignore-scripts` w CI niepotwierdzony dla `database`/`e2e` do pierwszego przebiegu; w razie awarii wystarczy jawne `npm rebuild` w tym jobie (opis w `security-notes.md` §11).
- Pakiety systemowe e2e nieprzypięte; obraz runnera po etykiecie.
- Skan historii widzi tylko lokalnie dostępne refy; wpisy na liście historii to skróty konkretnych wartości, więc nowy placeholder w nowym commicie da trafienie w tygodniowym jobie (nie wymagany).

## Ustawienia GitHub, które musi włączyć właściciel (nie da się z repozytorium)
1. Secret scanning oraz push protection (Settings > Advanced Security).
2. Dependabot alerts (i security updates).
3. Private vulnerability reporting.
4. Wymagane checki w ochronie gałęzi: `CodeQL / analyze` oraz job `a11y` (obecnie wymagane: `lint`, `unit`, `build`, `database`, `e2e`, `secrets`).
