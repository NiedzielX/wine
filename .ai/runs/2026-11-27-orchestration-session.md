---
started: 2026-11-27 08:00
ended: 2026-11-27 16:00
agent: Claude Code
spec: wiele — m.in. 2026-11-18-restaurant-picks, 2026-11-18-owner-proof-report, katalog (edycja pól i dodawanie ręczne), poprawka importu kosztu zakupu; szczegóły w opisach PR-ów
outcome: partial
related: [.ai/runs/2026-11-27-smoke-results-report.md, .ai/runs/2026-11-27-close-implemented-specs.md]
---

# Sesja orkiestracji: kolejka PR-ów od #164 do #204 i przygotowanie wydania 0.4.0

Godziny w nagłówku są przybliżone (log założony po przebiegu, z historii git i GitHub).

## Zadanie
Prowadzenie wielu równoległych prac przez pod-agentów w izolowanych worktree (jedna specyfikacja lub poprawka = jeden worktree), szeregowe scalanie ich PR-ów do `main` oraz przygotowanie wydania 0.4.0. Człowiek (właściciel) zatwierdza specyfikacje (`approved`), scalenia i wydanie.

## Przebieg
- Agent główny planował zadania (typy I, S, P, M według `.ai/docs/parallel-work.md`), zlecał je pod-agentom w osobnych worktree i scalał wyniki; dwie sesje nie edytowały tej samej specyfikacji.
- Scalanie szło szeregowo: ochrona `main` ma `strict`, każde scalenie robi pozostałe PR-y „behind”, a CI trwa ok. 12-15 minut. Skrypt scalający odczytujący wyniki tuż po pushu zgłaszał fałszywe „RED”; proces w tle ginął przy restarcie sesji, więc stan sprawdzano po restarcie.
- Poprawka #200 (koszt zakupu w imporcie) weszła bez niezależnego przeglądu; przegląd po fakcie i drugi przegląd #202 znalazły kolejne dziury (zob. lekcje).
- Napotkane: flaky T-33 (porównanie odczytów), zależności między plikami e2e na wspólnej bazie, alerty CodeQL (wycinanie `<script>`, „User-controlled bypass of security check”), hook `spec-status-guard` odmawiający `status: approved`, błędy tworzenia worktree i `git fetch`/`--force-with-lease`.

## PR-y scalone do `main` (od #164)
- #164 ręczny workflow migracji i seedu bazy demo z runnera GitHub.
- #165 `PGSSLMODE` dla Supabase w workflow bazy demo, dokumentacja i lekcja.
- #158 szkic specyfikacji płynności przejść menu z diagnozą, próbami, logiem i lekcją.
- #163 rezerwacja miejsca na pasek przewijania, żeby zmiana trasy nie przesuwała układu.
- #168 brief: D22 (miejsca sponsorowane) i D23 (uczenie między restauracjami) zastępują N01 i D18.
- #166 badania: krajobraz konkurencji i 13 proponowanych przewag.
- #169 E13 F1+F2: migawka opublikowana v2 i edycja profilu smakowego dań i win.
- #170 ogólne szablony instrukcji agentów do użycia w innych projektach.
- #173 CI: datowany wyjątek audytu dla advisory ReDoS picomatch.
- #172 test e2e: porównanie odczytów gościa bez kolejności strumieniowanych wierszy Flight (flake T-33).
- #171 konsolidacja dokumentacji procesu w `docs/PROCESS.md`.
- #167 szkic specyfikacji edycji pól dań i win.
- #174 standardy inżynieryjne jako własne projektu, usunięcie kopii wzorca.
- #175 specyfikacja wyborów restauracji, faza 1 (kolejność i etykieta, symulator).
- #177 edycja pól dań i win w panelu (C1).
- #178 etykieta wyboru restauracji nie jest pieczęcią sommeliera (krok 0 specyfikacji wyborów).
- #179 specyfikacja raportu wyników dla właściciela (stabilna linia bazowa pilotażu).
- #181 wybory restauracji: czytnik migawki i warstwa rankingu (PR0).
- #182 wybory restauracji: dane, schemat migawki 3, repozytoria (PR1a).
- #183 wybory restauracji: serwis, API i symulator przed/po (PR1b).
- #185 wybory restauracji po stronie gościa: etykieta, kolejność, flaga w API, zdarzenia użycia (PR2).
- #184 raport wyników: czyste metryki (okna, Wilson, Newcombe, werdykty), krok 1.
- #180 E19 F2 zastąpione wyborami restauracji; wyrównanie E13, E17 i odwołań w planie.
- #186 strategia produktu względem sommelier.bot po D22-D25 (badania i brief).
- #188 `SalesRepository.checkTotalsMarked` dla raportu wyników, krok 2.
- #187 wybory restauracji w panelu: ekran A27, znaczniki i nawigacja (PR3).
- #189 ukrywanie i pokazywanie dania gościom (C2).
- #192 ręczne dodawanie dania lub wina, ekran A32 (C3).
- #191 raport wyników: tabela `proof_launch_day` (dziennik dnia startu, tylko dopisywanie), krok 3.
- #193 bezpieczeństwo: akapit o sekretach wdrożenia i uczciwa uwaga o prompt injection.
- #194 skrypt sprawdzający, że nowe specyfikacje deklarują niezależność przeglądu.
- #190 Dependabot: grupa minor i patch, 17 aktualizacji.
- #195 skrypty smoke: panel wyborów, formularze dodawania, przycisk ukrycia, flaga wyboru.
- #196 raport wyników: `ProofReportService`, uprawnienia `proof.view` i `proof.manage`, krok 4.
- #197 raport wyników: trasy API i test granicy dostępu, krok 5.
- #198 raport wyników: ekran A33 „Raport wyników”, krok 6.
- #200 poprawka importu: kolumna kosztu zakupu nigdy nie staje się ceną.
- #201 raport wyników: wersja do druku, ekran A34, krok 7.
- #203 domknięcie specyfikacji wyborów F1 i edycji katalogu, zapis stanu raportu wyników.
- #204 skrypty smoke dla raportu wyników (A33, A34, trasy dowodowe).
- #202 poprawka po przeglądzie #200: kolumny kosztu w imporcie (brak nagłówka, „Cena nabycia”, dokładna cena wygrywa); scalony 2026-11-27 14:07 UTC.

Lista pochodzi z `git log origin/main --oneline` (numery bez wpisu, np. #176, nie występują w historii `main`).

## Weryfikacja
- `node scripts/check-context.mjs`: wynik w sekcji „Wynik” poniżej.
- `node scripts/check-qa-scenarios.mjs`, `node scripts/secret-scan.mjs`: wynik w sekcji „Wynik” poniżej.
- Zawartość listy PR-ów: `git log origin/main --oneline` (fetch z jawnym refspec), tytuły niejasnych z `gh api repos/NiedzielX/wine/pulls/<n> --jq .title`.

## Wynik
Kolejka scalona do #204 i #202; wydanie 0.4.0 przygotowane, nieopublikowane. Otwarte elementy:

PR-y otwarte w repozytorium:
- #199 specyfikacja marży (szkic po niezależnym przeglądzie): wymaga `status: approved` od człowieka; agentowi odmawia tego hook `spec-status-guard`.
- #205 wydanie 0.4.0 (`chore(release)`).
- #206 synchronizacja wersji w `AGENTS.md` i mapa wyborów, raportu i edycji katalogu w `core` (otwarty w chwili zapisu logu, spoza listy zlecenia).
- Dependabot #160 (`actions/checkout` 4.4.0 do 7.0.1) i #162 (`unpdf` 1.9.1 do 2.1.0): do decyzji; `unpdf` to zmiana wersji głównej parsera PDF, wymaga sprawdzenia importu PDF na plikach z `packages/db/tests/fixtures`.
- #202 w zleceniu figurował jako otwarty; w chwili zapisu logu jest scalony.

Po stronie właściciela:
- tag i GitHub Release 0.4.0 (wydanie decyduje człowiek, lekcja 2026-11-09);
- ustawienie `RATE_LIMIT_SECRET`;
- dodanie wymaganych checków `a11y`, `design`, `image` w ochronie gałęzi;
- usunięcie czterech gałęzi z nazwami lekcji;
- opinia prawna i regulamin dla D25;
- przegląd `scripts/` i dokumentacji bezpieczeństwa (pliki objęte CODEOWNERS);
- akceptacja (`status: approved`) specyfikacji marży z #199.

Dług i niezweryfikowane: zob. raport przekazany agentowi głównemu (m.in. godziny sesji przybliżone, pominięte PR-y spoza historii `main`).

## Lekcje
Nowe:
- [Pliki e2e biegną po kolei na jednej bazie](../lessons/2026-11-27-e2e-files-share-one-database.md)
- [CodeQL „Bad HTML filtering regexp” w testach](../lessons/2026-11-27-codeql-html-filtering-regexp-in-tests.md)
- [Zmiana kontraktu `handle()` pod alert CodeQL](../lessons/2026-11-27-handle-guard-contract-change-needs-contract-tests.md)
- [Niezależny przegląd poprawki `risk-high` przed scaleniem](../lessons/2026-11-27-independent-review-before-merging-high-risk-fix.md)
- [Ochrona `main` ma `strict`: scalanie szeregowe](../lessons/2026-11-27-strict-branch-protection-serial-merges.md)

Zaktualizowane (dopisana data 2026-11-27):
- [Dwa odczyty strony Next.js nie są bajt w bajt równe](../lessons/2026-11-18-streamed-flight-rows-vary-in-order.md)
- [Reguła bez egzekwowania jest życzeniem (hook `spec-status-guard`)](../lessons/2026-11-08-project-skills-and-spec-status-hook.md)
- [CLI MikroORM w worktree (dopisane: worktree, `git fetch`, `--force-with-lease`)](../lessons/2026-11-06-mikro-orm-cli-in-nested-worktree.md)
