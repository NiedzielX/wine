# Zasady code review

Ten plik mówi, na co patrzy recenzent (człowiek albo `om-code-review` / `om-auto-review-pr`) w PR-ze do Wine Match. Uzupełnia [AGENTS.md](AGENTS.md) i checklistę w [.github/pull_request_template.md](.github/pull_request_template.md); nie zastępuje ich. Przy sprzeczności wygrywa AGENTS.md §7.

## 1. Priorytety

Kolejność czytania diffu:

1. **Poprawność** — czy zmiana robi to, co obiecuje PR, łącznie ze stanami pustymi, błędu i brakiem uprawnień.
2. **Bezpieczeństwo i izolacja restauracji** — autoryzacja, CSRF, zakres danych (`restaurantId`), sekrety w logach.
3. **Kontrakty** — wszystko z [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md): API, trasy, schemat bazy, format importu, URL-e z kodów QR, `ENGINE_VERSION`.
4. **Zgodność z architekturą** — granice pakietów, porty i adaptery, ścieżka zapisu przez serwisy.
5. **Testy i dokumentacja** — test reprodukujący błąd, aktualizacja `docs/` w tym samym PR-ze.
6. Styl i nazewnictwo — tylko to, czego nie łapie `oxlint`.

## 2. Bramka walidacji

Zanim PR trafi do review, przechodzi lokalnie (kolejność z `.ai/agentic.config.json`):

```bash
npm run lint && npm run check:boundaries && npm run typecheck && npm test && npm run build
```

CI dodatkowo uruchamia `audit:gate`, `test:db`, `boot:check` i `test:e2e`. Czerwony job w CI to **blocker** w review, zgłaszany razem z resztą uwag, nie zamiast nich.

## 3. Kontrole specyficzne dla tego repo

### Wejście i błędy (API, akcje)

- Ciało żądania czytane wyłącznie przez `parseBody(req, schema)` albo `readUpload()` ([packages/core/src/validators/parse.ts](packages/core/src/validators/parse.ts)). Schematy to Zod `strictObject` w `core/src/validators/<koncept>/<nazwa>.schema.ts`, eksportowane z `validators/index.ts`.
- Trasa API nie ma własnego `try/catch`: przechodzi przez `handle()` / `handlePublic()` z [packages/app/src/server/api-auth.ts](packages/app/src/server/api-auth.ts). Mapowanie błędów jest tylko w `fromDomainError`; nowy kod błędu dostaje tam status HTTP i wpis w [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md).
- Serwisy rzucają podklasy `DomainError` ([packages/core/src/errors.ts](packages/core/src/errors.ts)) z literałem w `this.name`. W `app` nie używamy `instanceof` na błędach domenowych — tylko `domainError()` z `server/domain-errors.ts` (pilnuje tego `check:boundaries`).
- Klucze wybrane przez klienta trafiają do `Map` albo `Object.fromEntries`, nigdy `obj[k] = …`.

### Autoryzacja i sesje

- Każdy punkt wejścia sprawdza dostęp sam: `requireAccess(slug)` w layoutach, `authorizeAction(slug, permission)` w każdej akcji serwera, `handle(req, { write, slug, permission })` w każdej niepublicznej trasie. Ukryty przycisk to nie zabezpieczenie.
- Uprawnienie dotyczy konkretnej restauracji i konkretnego rekordu. Zapytanie bez `restaurantId` (poza wyszukaniem po slugu) to blocker.
- Zapis przez API wymaga `X-CSRF-Token` i odrzuca `Sec-Fetch-Site: cross-site` oraz obce `Origin`. PATCH/DELETE na parowaniach wymagają `If-Match`.
- Zmiana uprawnień ról ([packages/core/src/auth/permissions.ts](packages/core/src/auth/permissions.ts)), ciasteczka `wm_session` albo haszowania haseł to `risk-high` i wymaga drugiej osoby.

### Ścieżka zapisu i dane

- Zapisy idą tylko przez serwisy core (`SommelierService`, `PublishService`, `ImportService`): czyste reguły (`pairing-rules.ts`), atomowy commit, `actor` i opcjonalne `expectedVersion`. Sprawdzenie i zapis są w transakcji albo chronione unikalnym ograniczeniem.
- Goście czytają tylko opublikowany snapshot (`listPublished*`), nigdy wersję roboczą.
- Nowa metoda portu ma przypadek w [packages/core/src/testing/repository-contract.ts](packages/core/src/testing/repository-contract.ts) i obie implementacje: pamięciową (`core/src/memory`) i PostgreSQL (`db/src/repositories`).
- Migracje: tylko nowe pliki w `packages/db/src/migrations/`, z `up` i `down`; zastosowanej migracji nie edytujemy. `npm run schema:check -w @wine-match/db` musi pokazywać zgodność.

### Architektura i granice

- Kierunek zależności: `app → core, db, ui`; `db → core`; `mockups → core`; `core` i `ui` nie importują nic wewnętrznego. Strony i trasy w `app/src/app` nie importują `@wine-match/db` ani `@mikro-orm/`. Strony gościa używają tylko `@wine-match/ui/brand/*`.
- Rejestracja zależności tylko w `app/src/server/container.ts`, jedna jawna linia na wpis, bez `loadModules`.
- Konfiguracja tylko przez leniwe `env()`; build nie może wymagać środowiska ani bazy. Ustawienia „kto co widzi” domyślnie się zamykają.
- Logowanie tylko przez `logger` (redakcja w `core/src/logging/redact.ts`); `console.*` poza loggerem i skryptami to błąd.

### Silnik rekomendacji

- W `packages/core/src/engine/` nie ma `Math.random`, dat, sieci ani LLM. Remisy rozstrzyga id albo nazwa reguły.
- Nowa lub zmieniona reguła: nazwa w `rule`, test w `packages/core/tests/engine.test.ts`, wpis w [docs/RECOMMENDATION_ENGINE.md](docs/RECOMMENDATION_ENGINE.md), przegląd `npm run engine:matrix` w opisie PR-a. Zmiana wyników podnosi `ENGINE_VERSION`.
- Match Score to zawsze wynik silnika, bez podbijania. Etykieta „Sommelier recommendation” tylko dla parowań `approved` / `modified`.

### Frontend

- Widoki gościa działają bez JavaScriptu: komponenty serwerowe, filtry jako linki, formularze GET, cały stan w URL. Żadnego `localStorage` ani ciasteczek po stronie gościa.
- Akcje panelu to akcje serwera na zwykłych formularzach, zawsze z `revalidatePath(…, 'layout')`.
- Stany pusty, błędu i ładowania tylko przez `EmptyState` / `ErrorMessage` / `LoadingMessage` z `@wine-match/ui`. Nowe komponenty shadcn dodajemy w `packages/ui` przez `npx shadcn add`.
- Ekran sprawdzony przy 390 px i 1440 px, bez poziomego scrolla. Bez CDN, Google Fonts i `next/font/google`. W interfejsie gościa nie ma słowa „AI”.

### Testy i dokumentacja

- Poprawka błędu zaczyna się od testu, który go reprodukuje. Testy leżą w pakiecie, którego dotyczą (AGENTS.md §7).
- Pokrycie jest raportowane bez progu. Nowe wykluczenie z raportu w `vitest.config.ts` wymaga zgody właściciela.
- Zmiana API, modelu danych, silnika albo zachowania ekranu aktualizuje `docs/` w tym samym PR-ze. Funkcja widoczna dla użytkownika, zmiana silnika, modelu danych albo API ma specyfikację w `.ai/specs/`.
- Skrypty powłoki są POSIX-owe, bez bashizmów.

## 4. Ważność uwag

| Poziom | Kiedy | Skutek |
|---|---|---|
| **Blocker** | błąd poprawności, brak autoryzacji lub zakresu `restaurantId`, złamany kontrakt bez ścieżki z BACKWARD_COMPATIBILITY.md, edycja zastosowanej migracji, niedeterminizm w silniku, czerwone CI, konflikt z `main` | `changes-requested` |
| **Major** | brak testu dla nowej gałęzi logiki, brak aktualizacji `docs/`, obejście warstwy (np. zapis poza serwisem), brak stanu pustego/błędu | `changes-requested`, chyba że autor uzasadni w PR-ze |
| **Minor** | czytelność, nazewnictwo, drobny duplikat | komentarz, nie blokuje |
| **Nit** | preferencja | opcjonalne, oznaczone `nit:` |

Uwaga podaje plik i linię, opisuje skutek dla użytkownika lub systemu i proponuje poprawkę. PR z `risk-high` bez wymaganych dowodów (patrz [SDLC.md](SDLC.md)) blokujemy, chyba że maintainer zrezygnuje z wymogu w komentarzu na PR-ze.
