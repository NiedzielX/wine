---
started: 2026-11-25 18:00
ended: 2026-11-25 18:40
agent: Claude Code
spec: brak (dokumentacja i skrypt kontrolny bez zmiany zachowania produktu; reguła procesu opisana w `.ai/docs/review-protocol.md` §9)
outcome: success
related: [security-notes.md, .ai/docs/review-protocol.md, .ai/docs/process-templates.md, .ai/lessons/2026-11-09-reviewers-from-different-model-families.md, .ai/specs/2026-11-09-multi-family-review-harness.md]
---

# Aktualizacja security-notes.md (wdrożenie) i reguła niezależności przeglądu specyfikacji

## Zadanie
Dwie niezależne gałęzie z `origin/main`, każda jako osobny, mały PR (nie pushowane, nie otwierane; oba dotykają plików pod CODEOWNERS albo konfiguracji procesu):
- (A) `docs/security-notes-deployment-update`: `security-notes.md` ze stanem wdrożenia i uczciwą uwagą do próby prompt injection.
- (B) `feat/check-review-independence`: reguła `review_independence` w `check:context`, szablon, protokół review.

Ten log leży tylko w gałęzi (B), żeby dwa PR-y nie kolidowały w jednym pliku; gałąź (A) nie ma własnego logu (zmiana wyłącznie w `security-notes.md`).

## Przebieg
- Jeden izolowany worktree, dwie gałęzie z tego samego `origin/main` (7ebb423), `git fetch origin main:refs/remotes/origin/main`; `npm ci` z npm 11.6.2 (`package-lock.json` bez zmian).
- (A) Akapit „Sekrety wdrożenia” w punkcie 11 (zastępuje zdanie, że wdrożenie nie jest gotowe), uwaga w punkcie 7, zadania 7–8 w punkcie 8, data „Stan na” i wskazanie, że punkty 1–6 i 13 nie były ponownie sprawdzane. Bez wartości sekretów, adresów produkcyjnych, nazw ani identyfikatorów kont i bez nazw modeli. Fakty sprawdzone w repo: workflow `demo-database.yml` (środowisko `demo-database`, sekret `DEMO_DATABASE_URL`, zamiana portu transakcyjnego na sesyjny, `PGSSLMODE`), lekcja `2026-11-16-supabase-ssl-pgsslmode`, `.env.example` i `docs/DEPLOYMENT.md` (`TRUSTED_PROXY_HOPS`, `RATE_LIMIT_SECRET`), grep po `packages/*/src` (aplikacja nie czyta `SUPABASE_*` ani `POSTGRES_URL`). Ustawień platform hostingu i GitHuba nie da się z repo sprawdzić: opisane jako niezweryfikowane.
- (B) Logika w `scripts/lib/review-independence.mjs` (funkcje czyste, jak `stack-versions.mjs`, z `.d.mts` dla testów w TypeScript), wpięta w `scripts/check-context.mjs` jako sekcja 6b (ten sam job `lint`, żaden budżet rozmiaru nie wymusił osobnego skryptu). Próg: stała `REVIEW_INDEPENDENCE_SINCE = '2026-11-25'`, liczony po dacie w nazwie pliku, włącznie.
- Decyzje: błąd dla wartości spoza zbioru w każdej aktywnej specyfikacji (także draft i starej); wymóg pola, wartości innej niż `none` i nagłówka „Przegląd niezależny” (dowolny poziom nagłówka, pogrubienie nie liczy się) tylko dla `approved` / `in-progress` od progu; starsze bez pola: ostrzeżenie per plik i liczba w raporcie; `implemented/`, `archive/`, `product-brief.md`, `backlog.md` pominięte. Nie edytowano żadnej istniejącej specyfikacji ani logu, `AGENTS.md` bez zmian.
- Data: zegar środowiska pokazywał 2026-11-23, ale polecenie wskazało 2026-11-25 (nazwa logu i próg); użyto 2026-11-25 wszędzie, spójnie.

## Weryfikacja
(A) `node scripts/check-context.mjs`: 0 błędów, 13 ostrzeżeń (rozmiar specyfikacji, jak przed zmianą); `check:qa` 151 scenariuszy; `secrets:scan`: 22 trafienia, wszystkie na allowliście; `lint` 0; `typecheck` bez błędów; testkit `agent-guardrails`, `process-audit`, `check-context`: 196 zielonych.
(B) `lint` 0; `typecheck` bez błędów (pierwsze uruchomienie: brak deklaracji `.d.mts`, dodana); testkit `check-context.test.ts` 55 testów zielonych (11 nowych: poprawny, brak pola, `none`, brak sekcji, wartość spoza zbioru, stara specyfikacja z ostrzeżeniem i licznikiem, nowa bez pola jako błąd, pominięte statusy, próg po dacie z nazwy); cały pakiet testkit 686 zielonych, 1 pominięty. Dowód, że testy łapią regułę: po podmianie progu na 2099-01-01 pada 6 testów, po przywróceniu zielone. `check:context` na repozytorium: 0 błędów, 31 ostrzeżeń (13 starych + 18 „brak review_independence”); `check:qa` i `secrets:scan` zielone. `npm run build` i `npm test` pozostałych pakietów nie uruchamiano: kod aplikacji i pakiety `core`/`db`/`ui`/`app` nietknięte.

## Wynik
Obie gałęzie gotowe do przeglądu właściciela, niepushowane. Do zrobienia przez człowieka: przegląd zmian pod CODEOWNERS (`scripts/`), potwierdzenie ustawień platform z punktu 11 `security-notes.md`, powtórzenie próby prompt injection (`security-notes.md` punkty 7, 12). Dług: pole `review_independence` jest deklaracją, skrypt nie sprawdza jego prawdziwości; istniejące specyfikacje `approved` nie mają pola (ostrzeżenia), uzupełni je człowiek przy następnej edycji; szablon i `review-protocol.md` §9 nadal wspominają o `author_model` / `reviewed_by` z nazwami modeli (konwencja repozytorium od dziś: bez identyfikatorów), do uzgodnienia osobno.

## Lekcje
brak (reguła jest w `review-protocol.md` §9 i egzekwowana przez `check:context`).
