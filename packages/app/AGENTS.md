# packages/app — AGENTS.md

Zasady ogólne: `../../AGENTS.md` (§1.2–1.4 i §7). Ekrany: `../../docs/SCREEN_SPECIFICATION.md`, API: `../../docs/API_SPECIFICATION.md`.

**Co tu jest:** Next.js App Router w `src/app` z grupami tras `(guest)` (gość, `/r/[slug]/...`) i `(admin)` (panel, `/admin/...`), route handlery REST w `src/app/api/v1`, kod tylko serwerowy w `src/server` (kontener Awilix, zakres żądania, parsowanie parametrów).

**Zasady:**
- Strony i route handlery: parsuj wejście → rozwiąż serwis z zakresu żądania → wyrenderuj lub zwróć JSON. Bez logiki biznesowej i bez importów z `@wine-match/db`.
- Nowy serwis lub repozytorium rejestruj wyłącznie w `src/server/container.ts`, z właściwym czasem życia (serwisy i repozytoria: `scoped`).
- Komponenty serwerowe: `getRequestScope()`. Route handlery: `createRequestScope()` i `scope.dispose()` w `finally`.
- Strony z danymi restauracji mają `export const dynamic = 'force-dynamic'` (dane zmieniają się po publikacji), chyba że specyfikacja przewiduje cache.
- Gość: Tailwind z motywem `(guest)/guest.css`, z `@wine-match/ui` tylko `brand/*`. Panel: shadcn z `@wine-match/ui`.
- Route handlery zwracają błędy w formacie z `API_SPECIFICATION.md` (`{ error: { code, message, fields? } }`) i właściwe kody HTTP.
- `next.config.ts`: TypeScript 7 wymaga `experimental.useTypeScriptCli`; MikroORM i `pg` są w `serverExternalPackages`; konfiguracja wczytuje główny `.env` monorepo (`process.loadEnvFile`). Nie usuwaj tych ustawień.

- **Strony gościa (`(guest)`):** stan gościa (preferencje, wybrane dania) jest wyłącznie w parametrach URL — bez `localStorage` i cookies. Parsowanie i budowanie linków robi `@wine-match/core` (`parseGuestPrefs`, `prefsToQuery`, `with*`), a w aplikacji `hrefWith` z `src/server/guest-page.ts`. Filtry to linki, formularze to `GET`; JavaScript jest tylko dodatkiem (np. licznik w `_components/selection-count.tsx`), każda ścieżka działa bez niego.
- Wspólne komponenty gościa: `src/app/(guest)/_components` (`guest-ui.tsx`, `pref-chips.tsx`). Nie dodawaj tam logiki biznesowej.
- Przyklejone paski wymagają `scroll-padding` w `guest.css` i `pointer-events-none` na tle (lekcja `sticky-bars-scroll-padding`).

- **Panel (`(admin)`):** strony pod `/admin/[slug]/…`, dane wyłącznie przez `adminService` i serwisy odczytu z `core` (np. `AnalyticsService`, `SalesKpiService`; modele odczytu w `core`; filtry i liczenie w serwisie, nie w stronie). Filtry to formularze `GET`. Układ z nawigacją boczną: `(admin)/admin/_components` (`AdminShell`, `Page`, `PageHeader`, `badges.tsx`); komponenty z `@wine-match/ui`.
- **`loading.tsx` tylko w grupie `[slug]/(lists)/`** — strony ze szczegółami i przekierowaniami muszą leżeć poza nią, inaczej `notFound()` i `redirect()` dają status 200 (lekcja `nextjs-loading-streams-and-http-status`). Ekrany list panelu wymagają JavaScriptu (strumieniowanie); strony szczegółów i cała aplikacja gościa — nie.
- **Zapisy w panelu** to akcje serwerowe (`[slug]/actions.ts`) wywoływane zwykłymi formularzami (`ActionButton`), bez JavaScriptu. Akcja: czyta formularz, woła serwis z `core`, przekierowuje z wynikiem w URL (`?saved=` / `?error=`, komunikaty w `_components/flash.tsx`) i **zawsze** wywołuje `revalidatePath(..., 'layout')` (lekcja `server-action-layout-revalidate`). Adres powrotu jest walidowany (`safeBack`, bez open redirect). Autor zmiany: zalogowany użytkownik (`server/auth.ts`).
- **Dostęp:** panel i zapisy wymagają sesji (cookie `wm_session`). Trzy drzwi sprawdzają same: `requireAccess(slug)` w layoucie, `authorizeAction(slug, permission)` w każdej akcji, `handle(req, { write, slug, permission })` w każdym route handlerze zapisu (`server/api-auth.ts`: sesja, CSRF `X-CSRF-Token`, odrzucenie `Sec-Fetch-Site: cross-site` i obcego `Origin`, uprawnienie, mapowanie błędów na HTTP). Nowa akcja lub endpoint bez tych sprawdzeń jest błędem. Autor zmiany to zalogowany użytkownik (`Actor { id, name }`).
- **Błędy domenowe:** wyłącznie `domainError(e)` z `server/domain-errors.ts`. **Nie używaj `instanceof` ani nazw klas** — Next.js bundluje `core` osobno dla stron, akcji i route handlerów, a nazwy klas są minifikowane (lekcja `nextjs-duplicate-module-instanceof`).
- **Powrót po logowaniu:** `src/proxy.ts` przekazuje ścieżkę w nagłówku `x-pathname`; użycie zawsze przez `safeNext()` (tylko `/admin/...`).
- **Język (PL/EN):** `src/proxy.ts` ustawia `x-wine-lang` (`?lang` → `Accept-Language` → `en`; ciasteczko `wm_lang` tylko dla `/admin`). Strony czytają `getLocale()` / `getI18n()` z `server/i18n.ts`; teksty tylko ze słowników `src/i18n/en.ts` (źródło kluczy) i `pl.ts` (`satisfies Dictionary`), ceny przez `formatPrice`. Na stronach gościa linki buduje `href` z `guestContext` (dokleja jawne `lang`), formularze GET mają ukryte `lang`, gdy jest jawne. Komponent kliencki dostaje gotowe teksty, nie funkcje słownika. Trasy `/api/v1` nie przekazują `locale` (odpowiedzi po angielsku). **Treści restauracji** (spec `2026-10-15-bilingual-content`): strony gościa przekazują `locale` do `catalogService` / `recommendationService` (lokalizacja z tłumaczeń ostatniej publikacji), panel do `adminService` (bieżące tłumaczenia; formularze edytują `source`); bez `locale` serwisy zwracają pola bazowe — tak ma zostać w `/api/v1`. Przełącznik „Polski / English” jest na górze stron (gość: `LanguageSwitch` w `TopBar` / nagłówku G0; panel: górny pasek w `AdminShell`). Panel: przełącznik to akcja `setLanguage` (`(admin)/admin/language-actions.ts`, ciasteczko z `server/lang-cookie.ts`, powrót przez `languageBack`); komunikaty po kodzie w `_components/messages.ts` (flash, uwagi importu), daty i kwoty w `_components/format.ts` z `locale`; komponenty `@wine-match/ui` dostają teksty propsami.
- Cookie: httpOnly, SameSite=Lax, `Secure` w produkcji (`AUTH_COOKIE_SECURE=false` tylko do lokalnego `next start` po http). Nagłówki bezpieczeństwa w `next.config.ts` (`headers()`); strony panelu i `/api/v1/auth` nie są cache'owane.
- **Import i Setup:** akcje w `[slug]/import-actions.ts` (upload jako akcja serwerowa, limit `bodySizeLimit: 11mb` w `next.config.ts`), wspólny silnik akcji w `server/action-runner.ts` (`act()` obsługuje przekierowanie `to`). Podgląd importu to jeden formularz (`row_<n>_<pole>`, `row_<n>_include`), działa bez JS. Parser plików ładowany leniwie (`import()` w kontenerze), żeby strony gościa nie wczytywały bibliotek PDF i XLSX. Kod QR: `server/qr.ts`, endpoint `GET /api/v1/restaurants/{slug}/qr`.
- **Trasy API:** zawsze `handle()` (sesja, CSRF, uprawnienie) albo `handlePublic()` z `server/api-auth.ts`; ciało przez `parseBody(req, schemat)` (schematy w `core/validators`), upload przez `readUpload()`. Własny `try/catch` w trasie jest błędem: błędy mapuje `guarded()`, nieoczekiwane trafiają do `logger` z ogólnym 500.
- **Log i konfiguracja:** `logger` z `server/logger.ts` (jedyny moduł z `console`), `env()` z `server/env.ts` (czytane leniwie; strony, które go czytają, są `force-dynamic`). `instrumentation.ts` sprawdza konfigurację przy starcie serwera i kończy proces kodem 1 przy błędzie.
- Nowa strona panelu: dopisz sprawdzenia do `scripts/smoke.mjs` (kod HTTP i kluczowa treść).

**Sprawdzanie:** `npm run build -w @wine-match/app`, potem `next start` w trybie `DATA_SOURCE=memory` i `DATA_SOURCE=postgres` i w każdym z nich `npm run smoke -- http://localhost:<port> halka`. Zmiany UI: przeklikaj ścieżkę w przeglądarce przy 390 px, także z wyłączonym JavaScriptem.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
