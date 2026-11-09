---
started: 2026-11-09 14:48
ended: 2026-11-09 15:05
agent: Claude Code / claude-opus-5-5 (pod-agent w worktree)
spec: brak — dokumentacja procesu i narzędzia repozytorium (lekcja 22, polecenie właściciela); follow-upy jako draft `.ai/specs/2026-11-09-release-management-automation.md`
outcome: success
related: [.ai/runs/2026-11-09-lesson-21-multi-model-review.md]
---

# Lekcja 22 (zarządzanie wydaniem) przeniesiona na projekt jednego właściciela, bez decyzji właściciela

## Zadanie
Polecenie właściciela (przez sesję nadrzędną): przenieść lekcję 22 kursu (release management z Open Mercato) na Wine Match. Dostarczyć: `docs/RELEASING.md`, kontrakt zgodności wstecznej, `UPGRADE_NOTES.md`, skrypty `release-version.mjs` i `release-notes.mjs` z testami (najpierw czerwone), szkic workflow `release.yml` (tylko `workflow_dispatch`, bez publikacji pakietów i bez wdrożenia), lekcję z linią w indeksie, draft specyfikacji follow-upów, wskaźniki z `CONTRIBUTING.md` / `parallel-work.md`. Bez push i bez PR; commit lokalny.

## Przebieg
- Gałąź `docs/lesson-22-release-management` z `origin/main` (68e5b26). `node_modules` przez `npx -y npm@11.20.0 ci` (systemowy npm 10.9.9 nie spełnia `engines`).
- Przeczytane: `AGENTS.md` (§3, §5, §6.1, §8, §9), `.ai/docs/review-protocol.md`, `parallel-work.md`, `engineering-standards.md` (nagłówki, §11–§12), `commands.md`, `process-templates.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SDLC.md` (etykiety, bramki), `docs/DEPLOYMENT.md` (§5, §8, §10–§15), `docs/OPERATIONS.md`, `.github/workflows/*`, `scripts/check-context.mjs`, `scripts/review-validate.mjs` (konwencja skryptu i strażnika `main`), skille `om-close-fixed-issues`, `om-auto-manage-issues`, `om-auto-update-changelog`, `om-apply-upgrade-notes`, `om-merge-buddy`, `.ai/agentic.config.json`, `.ai/specs/backlog.md`.
- **Odstępstwo od polecenia (kontrakt):** w repozytorium jest już `BACKWARD_COMPATIBILITY.md` (19 KB, osiem powierzchni, ścieżki zmian, „Poza kontraktem”), na który wskazują `SDLC.md`, `CONTRIBUTING.md` i `DEPLOYMENT.md`. Drugi plik `docs/COMPATIBILITY.md` byłby duplikatem, który się rozjedzie. Zamiast niego uzupełniam istniejący kontrakt o to, czego brakowało względem lekcji: sekcję „Jak zapisać zmianę łamiącą” (wpis w `UPGRADE_NOTES.md`, format, przykład, testy), „Co wolno zmieniać swobodnie” (rozszerzenie „Poza kontraktem”) i zgodność wersji. Każde nowe twierdzenie sprawdzone w kodzie (sekcja Weryfikacja).
- Nagłówki `CHANGELOG.md` mają format Keep a Changelog (`## [X.Y.Z] - YYYY-MM-DD`), a skille `om-close-fixed-issues` i `om-auto-update-changelog` szukają `# X.Y.Z (YYYY-MM-DD)` (format Open Mercato). Skill `om-auto-update-changelog` mówi „dopasuj istniejący format”, więc zostajemy przy Keep a Changelog, a w `RELEASING.md` podajemy `--since vX.Y.Z` (tag) zamiast `last-release`.
- `.ai/skills/` ma lokalne rozszerzenie tylko dla `om-integration-tests`; dla skilli wydania nie ma rozszerzeń, więc dokumentacja odwołuje się do skilli bazowych z jawnymi argumentami.

- Skrypty: najpierw testy (`packages/testkit/tests/release-version.test.ts`, `release-notes.test.ts`), uruchomione na czerwono (moduły nie istniały: „Test Files 2 failed, no tests”), potem `scripts/release-version.mjs` i `scripts/release-notes.mjs` z `.d.mts` (konwencja `review-validate`), strażnik `main` wg lekcji `script-main-guard-vs-paths`, testy w katalogu ze spacją, `%` i `ł`. Numery linii w oczekiwaniach testów `release-notes` poprawione po przeliczeniu fixture'ów (pierwsza wersja liczyła o 2–4 linie za dużo).
- **Znalezisko:** `packages/app` i `packages/db` przypinają `@wine-match/testkit` dokładnie na `0.2.0` (devDependencies i `package-lock.json`). Po podniesieniu wersji pakietów npm nie powiązałby workspace'a i szukałby tej nazwy w rejestrze npm (ryzyko *dependency confusion*). Zgodnie z poleceniem skrypt nie zmienia zakresów: `--check` to wykrywa, `--set` odmawia z instrukcją; zmiana zakresów na `"*"` to osobny PR (zapisane w `RELEASING.md` §5 i §11). Dowód, że `--set` działa na prawdziwym drzewie: kopia plików wersji w katalogu tymczasowym z zakresami zmienionymi na `"*"` → `--set 0.3.0 --write` → `--check --expect 0.3.0` OK, `diff` lockfile'a pokazuje wyłącznie pola `version` (i ręcznie zmienione zakresy).
- Workflow `release.yml`: tylko `workflow_dispatch` (wejścia `version`, `publish` domyślnie `false`), `concurrency`, dwa joby: `verify` (`contents: read`, `checks: read`; strażnik `refs/heads/main`, regex wersji na zmiennej środowiskowej, `release:version --check --expect`, `release:notes render`, wymagane checki commitu przez API: `lint`, `secrets`, `unit`, `build`, `database`, `e2e`, `image`) i `release` (`contents: write`, jedyne prawo zapisu; ponowny strażnik gałęzi; idempotencja: istniejące wydanie = nic, tag na tym samym commicie = tylko wydanie, tag na innym = błąd). Tag i wydanie tworzy `gh release create --target "$GITHUB_SHA"` przez REST API z `GITHUB_TOKEN` podanym tylko w kroku; `persist-credentials: false` w obu checkoutach, bo nie ma `git push`. Domyślnie **szkic** wydania: tag powstaje dopiero, gdy właściciel naciśnie „Publish release”. Akcje: te same SHA co w `ci.yml` (`checkout` v4.4.0, `setup-node` v7.1.0); bez `npm ci` (skrypty bez zależności). Nie jest wymaganym checkiem.
- **`.github/` w tym PR-ze (`release.yml`, jedna linia w `pull_request_template.md`) to `risk-high`: dwa niezależne review, właściciel zleci przegląd.** Workflow nie był uruchomiony (może działać tylko na GitHubie); sprawdzone: składnia YAML (parser `yaml`), uprawnienia per job, piny, regex wersji lokalnie (`0.3.0`, `1.10.0` przechodzą; `v0.3.0`, `0.3`, `01.2.3`, `0.3.0; rm -rf /` odrzucone).
- `AGENTS.md`: wiersz routingu **nie dodany**. `AGENTS.md` ma 24 927 B (ostrzeżenie od 23 552 B), a łańcuch Codex root + `packages/app/AGENTS.md` ma 32 748 B przy limicie 32 768 B: każdy dodatkowy wiersz byłby błędem `check:context`. Wskaźniki: `CONTRIBUTING.md`, `.ai/docs/parallel-work.md` §1 pkt 13, `.ai/docs/commands.md`, `docs/DEPLOYMENT.md` §11, `CHANGELOG.md`.
- `.ai/lessons.md` (16 152 B, limit 16 384 B): skrócone opisy trzech lekcji z 2026-10-25 (`audit-gate-new-advisories`, `agent-config-in-repo`, `context-budget-and-routing`; treść lekcji bez zmian), dodana jedna linia; wynik 16 193 B.
- Pliki: `docs/RELEASING.md`, `UPGRADE_NOTES.md` (z wpisem dla #120, jedynej zmiany oznaczonej „Zmiana łamiąca” w `[Unreleased]`), `BACKWARD_COMPATIBILITY.md` (§9, „Poza kontraktem”), `CHANGELOG.md` (zdanie wstępne, wpis), `CONTRIBUTING.md`, `.github/pull_request_template.md`, `.github/workflows/release.yml`, `.ai/docs/commands.md`, `.ai/docs/parallel-work.md`, `docs/DEPLOYMENT.md` (§11 pkt 1), `package.json` (`release:version`, `release:notes`), skrypty i testy, lekcja, draft spec, ten log.

## Weryfikacja
- Testy czerwone przed implementacją: `npx vitest run tests/release-version.test.ts tests/release-notes.test.ts` → 2 pliki failed (brak modułów).
- Po implementacji: oba pliki 33/33 zielone.
- `npm run lint` → kod 0. `npm run typecheck` → kod 0. `npm test` → kod 0 (core 745, db 126, ui 62, app 500, testkit 480 testów).
- `npm run build` → kod 0. `npm run check:boundaries` → OK.
- `npm run check:context` → 0 błędów, 13 ostrzeżeń (te same co na `main`: rozmiar `AGENTS.md`, łańcuch Codex, `lessons.md` powyżej 12 KiB, duże specyfikacje).
- `npm run check:qa` → 105 scenariuszy OK. `npm run check:routes` → OK. `npm run secrets:scan` → tylko wpisy z allowlisty.
- `npm run release:version -- --check --expect 0.2.0` → OK (15 miejsc). `npm run release:notes -- check` → OK na prawdziwym `CHANGELOG.md` i `UPGRADE_NOTES.md`. `npm run release:notes -- promote 0.3.0 --date 2026-11-09` (tryb podglądu) → poprawna treść, nic nie zapisane (`git status`). `npm run release:version -- --set 0.3.0` → odmowa z powodu przypięcia `@wine-match/testkit` (zamierzone).
- Wszystkie polecenia npm przez `npx -y npm@11.20.0` (systemowy npm 10.9.9).

## Wynik
Gotowe lokalnie, jeden commit na `docs/lesson-22-release-management`, bez push i bez PR (polecenie). Nie zweryfikowane: przebieg `release.yml` na GitHubie (zapytanie o checki, `gh release create` szkicu, idempotencja), job `image` (nigdy nie przeszedł na `main`), skille `om-close-fixed-issues` / `om-auto-manage-issues` z argumentami z `RELEASING.md` (nie uruchamiane: mutują tracker).

Decyzje właściciela (zebrane w `docs/RELEASING.md` §11 i w drafcie spec): wersja 1.0, licencja, rytm wydań, hosting/domena/rejestr, `image` i CodeQL jako wymagane checki, włączenie `release.yml` po przeglądzie, zmiana zakresów `@wine-match/testkit` na `"*"`, kanał ogłoszeń, kamienie milowe.

Dług: `npm run release:notes -- check` nie jest w CI (po wydaniu `[Unreleased]` jest legalnie puste, więc jako wymagany check czerwieniłby `main`); ewentualne sprawdzenie samego kształtu w CI to propozycja do spec. Skille `om-close-fixed-issues` i `om-auto-update-changelog` szukają nagłówka `# X.Y.Z (data)`; do czasu lokalnego rozszerzenia (draft spec R5, R6) podajemy `--since vX.Y.Z`.

## Poprawki po dwóch review PR #143 (ta sama sesja, po merge `main` w a5a0d73)
Oba review: approve z uwagami nieblokującymi. Zrobione wszystkie dziewięć:
1. `release.yml`: wyszukanie taga rozróżnia 404 (stderr `(HTTP 404)`) od każdego innego błędu (403, 5xx, limit), który zatrzymuje przebieg.
2. Szkic `vX.Y.Z` z innym `target_commitish` niż `$GITHUB_SHA` = błąd „nieaktualny szkic, usuń go”; kilka wydań o tej nazwie = błąd; opublikowane wydanie bez taga = błąd.
3. Zapytanie o checki z `app_id=15368` (GitHub Actions).
4. Job `release` w środowisku `environment: release` (reguła gałęzi egzekwowana przez GitHuba, niezależnie od treści pliku); bez konfiguracji GitHub tworzy je bez ochrony, więc job nie wisi. Konfiguracja i ryzyko szczątkowe opisane w nagłówku workflow i `RELEASING.md` §7, decyzja w §11.
5. `RELEASING.md` §6: lista wydania (9 checków, plus `design`, `a11y`, `image`) celowo szersza niż ochrona gałęzi (6); `design` i `a11y` dodane do listy w workflow; CodeQL ręcznie.
6–7. Oba skrypty przyjmują tylko czyste `X.Y.Z` (bez prerelease, `+build`, zer wiodących) z jednym komunikatem; kolejność liczbowa jest wtedy pełną kolejnością SemVer. Zapis w `RELEASING.md` §3.
8. `release:version`: `--set` z `--check` lub `--expect`, `--write` bez `--set`, flaga podana dwa razy = kod 2.
9. Niepoprawny JSON: `<plik>: not valid JSON`, kod 1, bez stosu (bez komunikatu parsera, bo nowszy V8 cytuje w nim treść pliku).

Weryfikacja: nowe testy najpierw czerwone (9 failed, 30 passed), potem 39/39; logika kroku tworzenia wydania wykonana lokalnie na zaślepce `gh` w 10 scenariuszach (świeży szkic, publikacja, 403 przy tagu, tag na innym commicie, tag tutaj, ponowne uruchomienie, nieaktualny szkic, dwa szkice, opublikowane tutaj, opublikowane bez taga): oczekiwane kody i komunikaty. `lint` 0, `typecheck` 0, `npm test` 0 (testkit 487), `check:context` 0 błędów, `check:qa`, `check:routes`, `secrets:scan` OK. Workflow nadal nie uruchomiony na GitHubie.

## Uzupełnienie z materiału lekcji 22 (osobny commit, tylko dokumentacja)
`docs/RELEASING.md`: §12 „Próba odtworzenia z taga” (czysty worktree starego taga, obraz nigdy z bieżącego checkoutu, ścieżka B z `pg_restore`, `smoke --production`, zapis w `.ai/runs/…-recovery-drill.md`; raz przed pierwszym prawdziwym wydaniem, tylko instancja próbna) i wiersz w §11; tabela pięciu punktów kontrolnych lekcji w §6; zdanie o kolejce PR-ów i scalaniu tylko po wyraźnej zgodzie właściciela w §5. Draft spec: R10 (`om-auto-upgrade-*` jako opcja) i R11 (skrypt próby). `.ai/lessons.md` bez zmian. `check:context` 0 błędów, `secrets:scan` OK. Próba nie wykonana (wymaga Dockera i instancji próbnej).

## Lekcje
- `.ai/lessons/2026-11-09-release-is-a-human-decision.md`
