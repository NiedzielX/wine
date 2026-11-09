# Wydawanie wersji (release)

Jak z tego, co jest na `main`, powstaje wersja `vX.Y.Z`, która trafia do restauracji. Źródło: lekcja 22 kursu (zarządzanie wydaniem na przykładzie Open Mercato: 130+ kontrybutorów, 160 otwartych PR-ów), przeniesiona na projekt z jednym właścicielem. Wdrożenie, aktualizacja i **wycofanie**: [DEPLOYMENT.md](DEPLOYMENT.md) (§10, §11). Kontrakty: [BACKWARD_COMPATIBILITY.md](../BACKWARD_COMPATIBILITY.md). Zmiany łamiące: [UPGRADE_NOTES.md](../UPGRADE_NOTES.md). Monitoring po wdrożeniu: [OPERATIONS.md](OPERATIONS.md).

> **Stan.** Nic nie jest jeszcze otagowane (`CHANGELOG.md`, sekcja `[0.2.0]`). Workflow `.github/workflows/release.yml` to szkic, który nie był uruchomiony; job CI `image` nie przeszedł jeszcze na `main` (DEPLOYMENT.md §14). Pierwsze wydanie przejdzie tę listę ręcznie, krok po kroku.

## 1. Kto decyduje, co jest automatyczne

**Wydanie jest decyzją człowieka.** Właściciel decyduje, czy i kiedy wydajemy, co wchodzi, czy zmiana łamiąca jest akceptowalna, czy publikujemy i czy wdrażamy. Automaty przygotowują i sprawdzają; żaden agent ani workflow nie publikuje wydania, nie wdraża i nie wycofuje produkcji (DEPLOYMENT.md §10.5).

| Krok | Kto | Narzędzie |
|---|---|---|
| Decyzja „wydajemy X.Y.Z”, zakres, termin | właściciel | rozmowa / zgłoszenie |
| Porządek w zgłoszeniach (zamknięcie naprawionych, etykiety) | agent, właściciel przegląda | skille `om-close-fixed-issues`, `om-auto-manage-issues` (§4) |
| Wpisy w `CHANGELOG.md` i `UPGRADE_NOTES.md` | autor każdego PR-a; przy wydaniu agent sprawdza kompletność | `npm run release:notes -- check`, skill `om-auto-update-changelog --dry-run` |
| PR wydania: wersja i promocja sekcji | agent | `npm run release:version -- --set`, `npm run release:notes -- promote` |
| Weryfikacja zbiorcza (wszystkie checki, obraz) | CI | `ci.yml` na PR-ze wydania i na `main` |
| QA ludzkim okiem | właściciel albo tester | lista z §6 |
| Merge PR-a wydania | **właściciel** (zgoda w rozmowie, `review-protocol.md` §1) | GitHub |
| Utworzenie wydania (szkic) | workflow na żądanie | `release.yml` (§7) |
| Publikacja wydania (tag) | **właściciel** | przycisk „Publish release” |
| Wdrożenie, obserwacja, wycofanie | **właściciel** / operator | DEPLOYMENT.md §11, §10 |
| Ogłoszenie | **właściciel** | §8 |

Rytm: **wydajemy, gdy jest gotowe**, nie według kalendarza. Stały rytm (np. co dwa tygodnie) motywuje, ale wywiera presję na wpuszczanie niedokończonych rzeczy; jego wybór to decyzja właściciela (§11).

## 2. Model gałęzi: jedna gałąź `main`

Open Mercato ma `develop` (wydania nocne, środowisko deweloperskie, migawka pakietów po każdym merge) i `main` (stabilne); wydanie to jeden zbiorczy PR „release X.Y.Z” z `develop` do `main`, na którym widać zakres, konflikty i wszystkie checki naraz. **My mamy tylko `main`** i tak zostaje, bo:

- jeden właściciel, najwyżej 3 PR-y w review (`.ai/docs/parallel-work.md` §1), a każdy PR przechodzi przed merge pełne CI z `strict: true` (gałąź aktualna z `main`, `review-protocol.md` §7). `main` jest więc zawsze w stanie „po weryfikacji zbiorczej”: druga gałąź dodałaby synchronizację bez nowej informacji;
- nie publikujemy pakietów (wszystkie są `private`), więc nie ma migawek do testowania; nie mamy też środowiska deweloperskiego (decyzja właściciela, §11).

**Odpowiednik zbiorczego PR-a u nas to PR wydania** (§5): zmienia tylko wersje i promuje sekcje `CHANGELOG.md` / `UPGRADE_NOTES.md`, ale jego CI uruchamia wszystkie joby na dokładnie tym kodzie, który zostanie otagowany, a opis zbiera zakres (notatki z `release:notes`) i listę QA.

**Kiedy osobna gałąź `release/X.Y` jest uzasadniona** (decyzja właściciela w chwili potrzeby):
1. trzeba ustabilizować wydanie (np. przed pilotem z pierwszą restauracją), a na `main` mają dalej wchodzić funkcje: gałąź z `main`, na nią tylko poprawki, PR-y poprawek z bazą `release/X.Y` (CI działa dla każdego `pull_request`), a potem te same poprawki na `main`;
2. poprawka do starszego wydania, gdy `main` ma już niewydane zmiany, których nie wolno wypuścić (np. migracja *contract*): ścieżka hotfix (§9);
3. w projekcie pojawia się więcej osób i PR-ów niż jeden właściciel jest w stanie przejrzeć między wydaniami: wtedy wracamy do modelu z `develop` i zbiorczym PR-em (draft spec `.ai/specs/2026-11-09-release-management-automation.md`).

## 3. Wersjonowanie

- **SemVer 0.x** do czasu, aż właściciel zdefiniuje wersję 1.0 (§11; dziś wszystkie pakiety mają `0.2.0`). W 0.x: `0.MINOR.0` dla funkcji i **każdego** wydania z wpisem w `UPGRADE_NOTES.md`; `0.x.PATCH` tylko dla poprawek bez zmian łamiących.
- **Jedna wersja dla całego monorepo:** `package.json` w korzeniu, każdy pakiet i wpisy `package-lock.json` (`npm run release:version`). Zmieniane są wyłącznie własne pola `version`, nigdy zakresy zależności (`.npmrc`: `save-exact`).
- **Tag `vX.Y.Z`** na commicie z `main`; ten sam tag podaje operator w `WINE_MATCH_TAG` (DEPLOYMENT.md §10–§11). Tagów nie przesuwamy i nie usuwamy.
- **Osobne wersje, nie mylić:** `ENGINE_VERSION` silnika (`wm-rules-X.Y.Z`, BACKWARD_COMPATIBILITY.md §7) i wersja API w ścieżce (`/api/v1`, §2). Zmiana któregokolwiek ma własne reguły; wersja wydania tylko je zbiera.

## 4. Porządek w zgłoszeniach przed wydaniem

1. **Zamknij naprawione, a wciąż otwarte zgłoszenia:** `om-close-fixed-issues --since v<poprzednia> --dry-run`, przegląd wyniku, potem bez `--dry-run`. Podawaj tag jawnie: wartość domyślna `last-release` szuka nagłówka `# X.Y.Z (data)`, a nasz `CHANGELOG.md` ma format Keep a Changelog (`## [X.Y.Z] - data`). Przed pierwszym tagiem: `--since 2026-10-15` (pierwszy commit). Polskie słowa zamykające (`naprawia`, `zamyka`…) są w `closeKeywords` w `.ai/agentic.config.json`; sekcję „unmatched mentions” z raportu przejrzyj ręcznie.
2. **Uzupełnij etykiety otwartych zgłoszeń:** `om-auto-manage-issues --relabel-only --dry-run` (kategoria, priorytet, ryzyko wg `SDLC.md`), potem bez `--dry-run`. Zgłoszenie z `priority-high` / `priority-extreme` otwarte w zakresie wydania to pytanie do właściciela: blokuje wydanie czy idzie do następnego?
3. **Kamienie milowe jako plan wydań** są opcjonalne (decyzja właściciela, §11); dziś planem jest `.ai/specs/2026-11-04-product-completion-plan.md` i backlog `.ai/specs/backlog.md`.

Skille nie mają lokalnych rozszerzeń w `.ai/skills/` (jest tylko `om-integration-tests`); działają według `SDLC.md` i `.ai/agentic.config.json`. Etykiety tworzy tylko właściciel (`parallel-work.md` §9).

## 5. PR wydania

Na gałęzi `release/vX.Y.Z` z aktualnego `main` (agent lub właściciel):

1. `npm run release:notes -- check`: `[Unreleased]` ma wpisy i poprawny kształt, wpisy `UPGRADE_NOTES.md` mają cztery pola. Kompletność względem scalonych PR-ów: `om-auto-update-changelog --since v<poprzednia> --dry-run` i porównanie z `[Unreleased]` (zasługa dla autora oryginalnego PR-a, także gdy PR zastąpiono, wg reguły „Supersede Credit” skilla).
2. **Zmiany łamiące:** każdy wpis „Zmiana łamiąca” / „💥 Breaking” w `CHANGELOG.md` i każda zmiana powierzchni z `BACKWARD_COMPATIBILITY.md` ma wpis w `UPGRADE_NOTES.md`. Jest wpis → wersja co najmniej `0.MINOR+1.0`.
3. **Migracje:** `git diff v<poprzednia> HEAD --stat -- packages/db/src/migrations`; każda nowa migracja ma dowód up/down/up i plan wycofania w swoim PR-ze (`engineering-standards.md` §12). Migracja *contract* = notatka w `UPGRADE_NOTES.md`, że powrót do poprzedniego obrazu nie jest możliwy (DEPLOYMENT.md §5, §10.2). Na produkcji migracje idą tylko w przód; `migration:down` jest tam zabronione (DEPLOYMENT.md §10.1).
4. `npm run release:version -- --set X.Y.Z` (plan), potem z `--write`; `npm run release:version -- --check --expect X.Y.Z`. **Przed pierwszą zmianą wersji** `--set` odmówi, bo `packages/app` i `packages/db` przypinają `@wine-match/testkit` dokładnie na `0.2.0` (po zmianie wersji npm szukałby tej nazwy w rejestrze: ryzyko *dependency confusion*). Zmień te dwa zakresy na `"*"` (jak pozostałe zależności wewnętrzne) osobnym, przejrzanym PR-em z `npm install`.
5. `npm run release:notes -- promote X.Y.Z` (podgląd treści wydania), potem z `--write` (data: dziś w Europe/Warsaw albo `--date`). Popraw zdanie wstępne `CHANGELOG.md` o wersji i tagach.
6. PR „release vX.Y.Z” z etykietami `documentation`, `risk-low` (sama zmiana wersji i notatek; zakres wydania ocenia się na zmianach, które już weszły). W opisie: wynik `release:notes -- render X.Y.Z`, lista migracji, wynik listy QA (§6).

**Stabilizacja**, gdy CI PR-a wydania lub `main` jest czerwone: poprawka to zwykły PR do `main` (od reprodukcji, `fix-verification.md`). Agent może pracować w pętli „napraw, aż checki będą zielone” (`om-auto-fix-pr`, logi przez `gh run view --log-failed`), z limitem czasu na CI (`ci.maxWaitMinutes`: 40 w `.ai/agentic.config.json`) i etykietą `ci-monitoring` na czas czekania, żeby nie blokować kolejki. **Każdą dziwną poprawkę kwestionuj, zanim ją przyjmiesz:** wyłączony test, wyczyszczona wartość w `.env.example`, nowy wyjątek w allowliście, poluzowany próg, `--force`. Pytanie „dlaczego?” do autora (także agenta); obejście bez przyczyny to bloker, nie zielone CI.

**PR zastępczy z zachowaniem autorstwa** (gdy nie da się dopisać do cudzej gałęzi, np. PR z forka albo Dependabota): nowy PR z tym samym commitem (`git cherry-pick`, autor zostaje) albo z linią `Co-authored-by:` i `Supersedes #N` w opisie; zasługa w `CHANGELOG.md` dla autora oryginału. **Scalanie partiami** (`om-merge-buddy`) jest tylko raportem „co da się scalić”; scala właściciel, po jednym PR-ze.

## 6. Lista kontrolna wydania

Wszystko na commicie, który zostanie otagowany (PR wydania po merge = `main`).

| # | Sprawdzenie | Jak | Automatycznie? |
|---|---|---|---|
| 1 | Wymagane checki zielone: `lint`, `secrets`, `unit`, `build`, `database`, `e2e` | CI na `main`; `release.yml` sprawdza je przez API | tak |
| 2 | Job `image` zielony (obraz `runtime` i `migrator`: odmowy startu, migracje, `restaurant:create`, `smoke --production`, strona QR) | CI na `main`; `release.yml` go wymaga, choć ochrona gałęzi jeszcze nie (DEPLOYMENT.md §14) | tak |
| 3 | `design`, `a11y`, CodeQL zielone | karta Actions / Security | ręcznie |
| 4 | `npm run audit:gate`, `npm run secrets:scan`, `npm run check:context`, `npm run check:qa`, `npm run check:routes`, `npm run check:boundaries` | job `lint` / `secrets` albo lokalnie | tak (CI) |
| 5 | `npm run boot:check` po `npm run build` | job `build` | tak |
| 6 | Historia sekretów od poprzedniego wydania | ostatni przebieg `secrets-history.yml` zielony (albo uruchom go ręcznie) | ręcznie |
| 7 | `npm run release:version -- --check --expect X.Y.Z` | lokalnie i w `release.yml` | tak |
| 8 | `CHANGELOG.md`: `[Unreleased]` → `[X.Y.Z] - data`; `UPGRADE_NOTES.md` dla każdej zmiany łamiącej | `npm run release:notes -- render X.Y.Z` | tak (kształt), człowiek (treść) |
| 9 | Migracje przejrzane, plan wycofania znany (§5 pkt 3) | `git diff --stat` | ręcznie |
| 10 | QA ludzkim okiem (poniżej) na środowisku testowym | `npm run test-env:up`, `.ai/docs/qa-protocol.md` | człowiek |
| 11 | Próba wdrożenia, gdy wydanie zmienia obraz, Compose albo migracje *contract* | DEPLOYMENT.md §13 (instancja próbna, zrzut i odtworzenie, ścieżka A) | człowiek |

**QA ludzkim okiem** (to, czego e2e nie oceni: wygląd, sens, odczucie na telefonie). Scenariusze z `.ai/qa/` przechodzi człowiek w prawdziwej przeglądarce przy 390 px i 1440 px, bez poziomego przewijania i błędów w konsoli, z etykietą metody wg `qa-protocol.md`:
- gość: `guest-002` (strona po QR), `guest-005` (wina do dania i szybkie preferencje), `guest-011` (kod polecenia), `guest-014` (ilość wina dla stołu); etykieta „Para sommeliera” tylko przy parach zatwierdzonych (AGENTS.md §7), brak „AI” w interfejsie gościa;
- kelner: `staff-001` (potwierdzenie kodu), `staff-008` (cały stół na telefonie), `staff-009` (układ desktopowy);
- panel: `admin-003` (logowanie sommeliera), `admin-004` (ustawienia zmieniają ekran gościa), `kpi-003` (KPI bez poziomego przewijania), `team-005` (zaproszenie bez JavaScriptu);
- restauracja: `restaurant-004` (strona gościa działa, złe hasło odrzucone); strona `/admin/<slug>/qr` pokazuje `PUBLIC_BASE_URL/r/<slug>` instancji;
- każda zmiana z `UPGRADE_NOTES.md` przećwiczona na instancji próbnej według pola „Co zrobić”.

Wynik (PASS/FAIL na scenariusz, środowisko, `QA head: <sha>`) w opisie PR-a wydania.

## 7. Wydanie

1. Właściciel scala PR wydania (zgoda w rozmowie).
2. **Actions → Release → Run workflow** z gałęzi `main`, `version: X.Y.Z` (bez `v`), `publish: false`. Workflow (szkic, `.github/workflows/release.yml`) odmawia na innej gałęzi niż `main`, sprawdza wersje, notatki i checki tego commitu (lista powyżej, pkt 1–2), po czym tworzy **szkic** GitHub Release `vX.Y.Z` z notatkami z `CHANGELOG.md` i `UPGRADE_NOTES.md`. Nie publikuje pakietów (nic nie idzie do npm), nie buduje obrazu do rejestru i nie wdraża. Uruchomiony drugi raz nic nie zmienia; tag wskazujący inny commit zatrzymuje go z błędem.
3. Właściciel czyta szkic i naciska **Publish release**: dopiero wtedy GitHub tworzy tag `vX.Y.Z` na tym commicie. (`publish: true` robi to od razu; używaj, gdy szkic nie jest potrzebny.)
4. Wdrożenie wg DEPLOYMENT.md §11 (kopia, `migrate`, `migration:pending`, `app`, weryfikacja §8). Nieudana weryfikacja: drzewo decyzyjne DEPLOYMENT.md §10.2 (najpierw poprawka w przód, wycofanie obrazu tylko bez migracji *contract*, odtworzenie ze zrzutu decyduje właściciel).
5. **Okno obserwacji 1–2 dni** przed ogłoszeniem: alerty i objawy z OPERATIONS.md, `http_requests_total{status_class="5xx"}`, zgłoszenia od restauracji. Pilne zgłoszenie = poprawka w przód jako `X.Y.Z+1` (§9).

Ręczny odpowiednik workflow (np. zanim szkic zostanie przejrzany): `npm run release:notes -- render X.Y.Z --out notes.md` i `gh release create vX.Y.Z --target <sha z main> --title "Wine Match vX.Y.Z" --notes-file notes.md --draft`.

## 8. Ogłoszenie

Po oknie obserwacji właściciel ogłasza wydanie restauracjom (co nowego, co zrobić, z `UPGRADE_NOTES.md` językiem restauracji, nie kodu). Kanał i forma to decyzja właściciela (§11). Agent może przygotować szkic tekstu z notatek; nie wysyła go.

## 9. Poprawka pilna (hotfix)

- **Domyślnie:** poprawka jak każda (test, który pada, `npm run verify:regression`, review drugiej sesji), merge do `main`, wydanie `X.Y.Z+1` tą samą ścieżką (§5–§7), z wpisem `### Poprawki` w `CHANGELOG.md`. QA zawężone do poprawionego scenariusza i jego sąsiadów.
- **Gdy `main` ma niewydane zmiany, których nie wolno wypuścić:** gałąź `release/X.Y` z tagu `vX.Y.Z` (`git switch -c release/X.Y vX.Y.Z`), PR poprawki z bazą `release/X.Y` (pełne CI), zmiana wersji i promocja notatek na tej gałęzi, a wydanie ręcznie przez właściciela: `gh release create vX.Y.Z+1 --target release/X.Y --notes-file …` (workflow działa tylko z `main`; rozszerzenie go to decyzja właściciela). Potem ta sama poprawka na `main` (cherry-pick z testem), a wpis w `CHANGELOG.md` na `main` dostaje sekcję `[X.Y.Z+1]`.
- Wycofanie zamiast poprawki: DEPLOYMENT.md §10 (zawsze po zrzucie, nigdy `migration:down` na produkcji).

## 10. Środowiska podglądu i inne automaty

Środowisko „preview” dla każdego PR-a (Vercel, Netlify, Railway, Coolify, Dokploy…) pozwoliłoby agentom testować na wdrożonej wersji zamiast stawiać aplikację lokalnie; dziś agent używa `npm run test-env:up` (`.ai/docs/commands.md`). Nocne środowisko, podgląd per PR, kolejka scalania, automatyczny PR zastępczy z zasługą i synchronizacja zgłoszeń to propozycje w drafcie `.ai/specs/2026-11-09-release-management-automation.md` (nie zatwierdzone; nic z tego nie jest wdrożone).

## 11. Decyzje właściciela

| Decyzja | Stan | Wpływ |
|---|---|---|
| Definicja wersji 1.0 | otwarte | do tego czasu SemVer 0.x (§3) |
| Licencja | nie wybrana (`CONTRIBUTING.md`) | treść notatek wydania i to, czy repozytorium może być publiczne |
| Rytm wydań (stały czy „gdy gotowe”) | „gdy gotowe” do decyzji | §1 |
| Hosting, domena, rejestr obrazów | DEPLOYMENT.md §15 | wdrożenie, podgląd per PR, środowisko nocne |
| `image` i CodeQL jako wymagane checki | DEPLOYMENT.md §14, `review-protocol.md` §7 | dziś wymaga ich tylko `release.yml` / ta lista |
| Włączenie `release.yml` (pierwsze uruchomienie i przegląd `.github/`) | szkic, przegląd `risk-high` (dwa review) | §7 |
| Zakresy `@wine-match/testkit` `0.2.0` → `"*"` | do zrobienia przed pierwszą zmianą wersji | §5 pkt 4 |
| Kanał ogłoszeń dla restauracji, kamienie milowe | otwarte | §4, §8 |
