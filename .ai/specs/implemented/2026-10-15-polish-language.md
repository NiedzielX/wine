---
status: implemented
created: 2026-10-15
owner: Filip
related: [.ai/specs/product-brief.md, .ai/specs/implemented/2026-10-15-guest-short-path-and-desktop.md, docs/SCREEN_SPECIFICATION.md, docs/RECOMMENDATION_ENGINE.md]
---

# Polska wersja językowa

## 📝 TLDR
Cały interfejs Wine Match jest po angielsku (D06), a pierwsze restauracje i ich goście są w Polsce (brief Q04). **Proponujemy** polską wersję językową: aplikacja gościa i panel w PL i EN, język dobierany z `Accept-Language` przeglądarki, przełącznik „PL | EN”, wybór gościa niesiony w URL (`lang`), w panelu zapamiętany w ciasteczku. Uzasadnienia silnika, słowa smaku i komunikaty też są tłumaczone; treści restauracji (nazwy i opisy dań i win, notatki sommeliera) zostają w języku, w którym je wpisano.

## Problem
- Gość w Warszawie widzi „Pick your dish”, „By the glass”, „Why it works” — dla części gości bariera; Q04 w briefie pyta o polski interfejs gościa.
- Personel (sommelier, GM, kelner) pracuje w panelu i widoku kelnera po angielsku.
- D06 (interfejs po angielsku) był decyzją MVP; właściciel prosi teraz o polską wersję (2026-10-15).

## Cel i zakres
PL i EN dla aplikacji gościa (G0–G9) i panelu (A0–A13), bez zmiany adresów i bez nowej zależności.
**Poza zakresem:** tłumaczenie treści restauracji (dania, wina, notatki — restauracja wpisuje je w swoim języku), inne języki niż PL/EN (struktura na to pozwala), tłumaczenie odpowiedzi REST API `/api/v1` (pola `why`, `notice` zostają po angielsku; parametr `lang` w API — osobna specyfikacja), e-maile (nie ma ich).

## Wymagania
- **R1** Obsługiwane języki: `pl`, `en`. Typ `Locale = 'pl' | 'en'` w `core`.
- **R2** Wybór języka (gość): parametr `lang` w URL ma pierwszeństwo; bez niego najlepsze dopasowanie z nagłówka `Accept-Language` (pierwszy z `pl`/`en`); brak dopasowania → `en`. Bez ciasteczek i pamięci przeglądarki (R05 briefu, `packages/app/AGENTS.md`).
- **R3** Przełącznik „PL | EN” na G0 (w nagłówku restauracji) i w top barze pozostałych stron gościa; to link do tej samej strony z `lang=…`. Linki gościa niosą `lang` **tylko wtedy, gdy był jawnie w URL** (język z `Accept-Language` nie trafia do linków). `lang` dokleja jedna funkcja (`hrefWith` w `server/guest-page.ts`) — ta sama, którą E02 rozszerzy o `sid`; parametry w stałej kolejności. Formularze GET (G5, G7) mają ukryte pole `lang`, gdy jest jawne. Udostępniony link bez `lang` otwiera się w języku przeglądarki odbiorcy (zamierzone).
- **R4** Panel: język z ciasteczka `wm_lang` (ustawiane przełącznikiem w panelu, `SameSite=Lax`, rok, bez danych osobowych), bez ciasteczka — `Accept-Language`, potem `en`. Ekran logowania (A0) też. Proxy czyta `wm_lang` **wyłącznie dla `/admin/*`**; na trasach gościa ciasteczko jest ignorowane. Akcja przełącznika wraca na stronę przez `safeBack` i nie dotyka sesji.
- **R5** `<html lang>` odpowiada wybranemu językowi (gość i panel).
- **R6** Teksty interfejsu w słownikach: `packages/app/src/i18n/en.ts` (źródło kluczy) i `pl.ts` (`satisfies` typ z `en`, więc brakujący klucz to błąd TypeScript). Bez biblioteki i18n.
- **R7** Teksty z `core` widoczne dla gościa przyjmują opcjonalne `locale` (domyślnie `en`): słowa smaku (`tasteWords`), etykiety stylów (`STYLE_LABELS` → `styleLabel(style, locale)`), podsumowanie preferencji (`prefsSummary`), komunikat budżetu (`recommend.ts` notice), uzasadnienia silnika (`explain`, `styleWord` w `scoring.ts`, uzasadnienia stolika w `table.ts`). **Tłumaczone są tylko etykiety, nigdy wartości w URL** (`styles=red`, kategorie `Starters/Mains/Desserts` jako kotwice i klucze zostają). Silnik zostaje deterministyczny. Trasy `/api/v1` nie przekazują `locale` ani nagłówka — odpowiedzi API zostają po angielsku (test).
- **R8** Uzasadnienia silnika po polsku: w miejscu definicji reguły tekst jest parą `{ en, pl }` (w `add()` i w `AFFINITIES`), `Factor.why` zostaje tekstem EN (API bez zmian), a `Factor.whyPl` niesie PL. `explain(factors, wine, locale)` składa zdanie w danym języku, łącznie z `styleWord` i zdaniem awaryjnym „A balanced, food-friendly …”. Typ pary wymusza tłumaczenie w kompilacji — brak mapy tekst→tekst.
- **R9** Kwoty, daty i liczby: `Intl` z locale (`pl-PL`: „1 234 zł”, daty `15.10.2026`); waluta zostaje „zł”.
- **R10** Notatka sommeliera (`pairing.comment`) wyświetlana bez zmian w obu językach.
- **R11** Adresy i parametry gościa bez zmian poza nowym, opcjonalnym `lang` (BC §1: dodanie parametru jest bezpieczne); stary link bez `lang` działa i dostaje język z przeglądarki.
- **R12** Odpowiedzi stron `/r/*` i `/admin/*` mają `Vary: Accept-Language` (oraz `Cookie` dla panelu), żeby przeglądarka i bfcache nie podały wersji w złym języku.
- **R13** Teksty spoza słownika: tytuły stron (`metadata` → `generateMetadata`, szablony `%s | Wine Match`), `not-found.tsx`, `error.tsx`, `forbidden.tsx`, `loading.tsx`, komunikaty flash panelu (`_components/flash.tsx`) i błędy importu — tłumaczone w UI **po kodzie** (`code` błędu importu / flash), nie po tekście; brak tłumaczenia kodu → tekst EN. Teksty domyślne w komponentach `EmptyState`/`ErrorMessage`/`LoadingMessage` z `@wine-match/ui` przekazywane jako propsy ze słownika. `_components/format.ts` panelu przechodzi na `Intl` z locale.

## Resolved assumptions (autonomous defaults)
| # | Pytanie | Odpowiedź | Uzasadnienie |
|---|---|---|---|
| A1 | Język w ścieżce (`/pl/r/…`) czy w parametrze? | Parametr `lang` (R2). | Zero zmian adresów i kodów QR (BC §1); spójne z preferencjami w URL. |
| A2 | Domyślny język bez `lang`? | `Accept-Language`, potem `en`. | Gość z polskim telefonem od razu widzi PL, turysta EN; bez ustawień restauracji. |
| A3 | Ustawienie języka domyślnego per restauracja? | Nie teraz (Later). | Nie ma takiej potrzeby przy jednym pilocie; wymagałoby migracji. |
| A4 | Biblioteka (`next-intl`)? | Nie — własne słowniki z kontrolą typów. | AGENTS §1.1: nowa biblioteka wymaga uzasadnienia; dwa języki i ~400 tekstów nie uzasadniają zależności. |
| A5 | Panel: ciasteczko języka? | Tak (`wm_lang`). | Panel już używa ciasteczek sesji; ograniczenie „bez ciasteczek” dotyczy tylko gościa. |
| A6 | Tłumaczenie `why` w API? | Nie w tej specyfikacji. | API to kontrakt (BC §2); dodanie `lang` do API osobno. |
| A7 | Kto tłumaczy? | Agent (polszczyzna naturalna, ton restauracji, bez „AI”); słownictwo winiarskie do przeglądu przez sommeliera (Domain expert). | Szybki start; Domain expert zatwierdza słownictwo przed pilotem. |
| A8 | Słownik w `app` czy w `ui`? | `app/src/i18n` (teksty stron); `core` tylko dla tekstów domeny. | `ui` nie zna `core` ani aplikacji (granice §1.2). |
| A9 | Komunikaty błędów importu i flash | Tłumaczone w UI po kodzie (R13). | Core zostaje bez słowników UI; kody już istnieją. |
| A10 | `lang` z `Accept-Language` w linkach? | Nie — tylko jawny `lang` (R3). | Krótsze linki; język przeglądarki działa na każdej stronie sam. |

## Architektura
- **Wybór języka:** `src/proxy.ts` (matcher rozszerzony o `/r/:path*`; `x-pathname` dalej tylko dla `/admin`) ustala `x-wine-lang` z `?lang`, potem `wm_lang` (tylko `/admin`), potem `Accept-Language` przez `pickLocale` z `core`; nagłówek zawsze nadpisywany przez proxy; ustawia też `Vary` (R12). `server/i18n.ts`: `getLocale()` (czyta `headers()`), `getDictionary(locale)`, `formatPrice(n, locale)` (NBSP w PL).
- **Gość:** layout `(guest)` ustawia `<html lang>`. `hrefWith` dostaje `lang` w `extra`, gdy jest w URL (`guestContext` zwraca `lang` i `locale`). Komponenty `guest-ui.tsx` i `pref-chips.tsx` przyjmują `t` (słownik) i `locale`. Przełącznik `LanguageSwitch`.
- **Panel:** layout `(admin)` ustawia `<html lang>`; przełącznik w `AdminShell` to formularz z akcją serwerową ustawiającą `wm_lang` i wracającą na tę samą stronę (bez JS). Strony i komponenty panelu czytają słownik.
- **Core:** `i18n/locale.ts` (`Locale`, `isLocale`), `engine/why-pl.ts` (mapa tekstów `why` EN → PL + składanie zdania PL), `guest/taste.ts` i `guest/prefs.ts` z parametrem `locale` (domyślnie `en` — istniejące wywołania i API bez zmian). `recommendationService.forDish(slug, dishId, prefs, locale?)` przekazuje `locale` do `explain` i komunikatu.

## Model danych
Bez zmian.

## Kontrakty
- URL gościa: nowy opcjonalny parametr `lang=pl|en` (BC §1 — dodanie parametru). `BACKWARD_COMPATIBILITY.md` §1 dopisuje `lang` do listy parametrów gościa.
- Ciasteczko panelu `wm_lang` (nowe; BC §5 lista ciasteczek).
- API `/api/v1` bez zmian (A6).

## UI/UX
- Przełącznik „PL | EN”: na G0 w prawym górnym rogu nagłówka, na pozostałych stronach gościa w top barze (miejsce obok „Refine”, a na stronach bez Refine po prawej); w panelu w stopce nawigacji bocznej. Aktywny język `aria-current="true"`.
- Polskie teksty mieszczą się przy 390 px (dłuższe słowa: przyciski z `min-h` i zawijaniem, chipy przewijane poziomo).
- Ton: jak teraz — głos restauracji, bez „AI” (N02); przykład: „Wybierz danie”, „Pasuje do Twojego dania”, „Rekomendacja sommeliera”, „Na kieliszki”, „Na butelki”, „Więcej…”.

## Edge Cases & Failure Scenarios
| Sytuacja | Zachowanie |
|---|---|
| `lang=de` lub inna wartość | ignorowana → `Accept-Language` / `en`. |
| Brak `Accept-Language` (bot, `curl`) | `en`. |
| Udostępniony link z `lang=pl` | odbiorca widzi PL. |
| Brak tłumaczenia `why` (nowa reguła bez wpisu) | test w CI nie przechodzi; w runtime awaryjnie tekst EN. |
| Długie polskie słowa w wąskich chipach | przewijany rząd; bez łamania układu (sprawdzenie 390 px). |
| Smoke/E2E bez nagłówka języka | `en` — dotychczasowe asercje działają; nowe sprawdzenia z `lang=pl`. |

## Ryzyka
- **Rozmiar zmiany:** ~40 plików UI; ryzyko pominiętego tekstu → test „brak twardych angielskich tekstów” niepraktyczny, więc przegląd zrzutów PL przy 390/1440 px dla każdej strony i smoke z `lang=pl` na każdej trasie gościa.
- **Uzasadnienia silnika** to tekst produktowy; zła polszczyzna obniża zaufanie — słownictwo do przeglądu przez Domain experta (A7).
- **Cache:** strony gościa są `force-dynamic`; język z nagłówka nie trafia do cache CDN (brak cache stron) — przy przyszłym cache potrzebne `Vary: Accept-Language`.
- Odwracalność: pełna (bez danych i migracji).

## Decyzje w grze
- **D06** (interfejs po angielsku) — **superseded** przez tę specyfikację po akceptacji właściciela (nowy wpis D11 w briefie: PL i EN, wybór z przeglądarki); **Q04** w briefie zamknięte.
- N02 (bez „AI”), R01/R02 bez zmian. Spec `2026-10-15-guest-short-path-and-desktop` — przełącznik dochodzi do top baru.

## User stories
- **Gość z polskim telefonem** skanuje QR → strona po polsku („Wybierz danie”) → wybiera danie → uzasadnienie wina po polsku, nazwy win bez zmian → wybiera wino. System dobiera język z przeglądarki, nic nie zapisuje.
- **Turysta** z angielskim telefonem przy tym samym stoliku → ten sam kod QR → wersja angielska.
- **Gość, który woli angielski** mimo polskiego telefonu → „EN” w rogu → cała dalsza ścieżka po angielsku (język w linkach).
- **Sommelier** loguje się do panelu → panel po polsku (przeglądarka PL) → przełącza na EN → wybór zapamiętany w ciasteczku przy kolejnych wizytach.

## Kryteria akceptacji
- [x] AC1 (R2, R5) `GET /r/halka` z `Accept-Language: pl-PL` → `<html lang="pl">`, „Wybierz danie”; z `en-GB` lub bez nagłówka → „Pick your dish”. Smoke.
- [x] AC2 (R2, R3) `?lang=en` przy `Accept-Language: pl` → EN; linki dań, Back, chipy i formularze niosą `lang=en`. Smoke.
- [x] AC3 (R7, R8) G3 kaczki z `lang=pl`: uzasadnienie silnika i słowa smaku po polsku, notatka sommeliera bez zmian; test jednostkowy: każda reguła `why` ma PL.
- [x] AC4 (R4) Panel: bez ciasteczka i z `Accept-Language: pl` — logowanie i przegląd po polsku; przełącznik ustawia `wm_lang=en` i panel przechodzi na EN bez JS. E2E/SSR.
- [x] AC5 (R9) Ceny „1 234 zł” (spacja NBSP) w PL i „1,234 zł” w EN; daty w panelu wg locale.
- [x] AC6 (R6) `pl.ts` bez brakujących kluczy (typecheck).
- [ ] AC7 (częściowo: gość 390 px w fazie 1; panel A0 przy 390 px, A0/A1/A2/A4/A6/A7/A10/A11 przy 1440 px — bez przewijania; brak zrzutów A1/A6 przy 390 px) Zrzuty PL przy 390 i 1440 px dla G0, G3, G4, G5, G7, G8, A1, A6 bez poziomego przewijania; ścieżka gościa bez JS.
- [ ] AC8 (bez E2E w fazie 2; reszta zielona) `lint`, `typecheck`, `test`, `build`, smoke (EN i PL), E2E zielone; docs zaktualizowane (SCREEN_SPECIFICATION, BC §1/§5, brief D11/Q04, RECOMMENDATION_ENGINE §uzasadnienia).

## 📋 Phasing
- **Faza 1 — gość (osobny PR):** R1–R3, R5–R13 (część gościa), core `locale`, smoke PL; brief D11 / Q04 i BC §1.
- **Faza 2 — panel (osobny PR):** R4, R5, R9, R12, R13 (panel: flash, import po kodzie, `format.ts`), słownik panelu, E2E panelu PL, BC §5 (`wm_lang`).

## 📋 Implementation Plan
1. Core: `Locale`, `isLocale`, `pickLocale(acceptLanguage)`; `tasteWords`, `STYLE_LABELS`, `prefsSummary` z `locale`; `why-pl.ts` + `explain(factors, wine, locale)`; notice w `recommend.ts` i uzasadnienia `table.ts` z `locale`; testy (pokrycie tłumaczeń, `pickLocale`).
2. App: `i18n/en.ts`, `i18n/pl.ts`, `server/i18n.ts`; proxy rozszerzony o `/r/:path*` i `x-wine-lang`.
3. Gość: layout `lang`, `guestContext` → `locale`, `lang`; `hrefWith` niesie `lang`; wszystkie strony i komponenty gościa na słowniku; `LanguageSwitch`; ukryte pola `lang` w formularzach.
4. Smoke: trasy gościa z `Accept-Language: pl` i `lang=en`; E2E strony startowej PL.
5. Panel: słownik panelu, `AdminShell` przełącznik (akcja serwerowa `setLanguage`), ekrany A0–A13, daty i ceny przez `Intl`; E2E logowania PL.
6. Docs i brief (D11 supersedes D06, Q04 zamknięte), BC §1/§5, zrzuty w logu.

## Grill log
| # | Pytanie | Odpowiedź | Przyjęte przez |
|---|---|---|---|
| 1 | Tłumaczenia `why` jako pary `{en, pl}` przy regule? | Tak | agent-default |
| 2 | `lang` w linkach tylko jawny? | Tak | agent-default |
| 3 | Etykiety tłumaczone, wartości URL nie? | Tak | agent-default |
| 4 | API zostaje po angielsku (test)? | Tak | agent-default |
| 5 | `Vary: Accept-Language` teraz? | Tak | agent-default |
| 6 | Błędy importu i flash po kodzie? | Tak | agent-default |
| 7 | Dwa PR-y: gość, potem panel? | Tak | agent-default |
| 8 | D06 (EN) zastąpione przez D11 (PL+EN)? | Tak | owner ✅ (Filip, 2026-10-15) |

## Changelog
- 2026-10-15 — draft (om-spec-writing --autonomous, prośba właściciela „dodaj polską wersję językową”).
- 2026-10-15 — cross-model review (Sonnet 5.5): 2 High, 7 Medium, 4 Low — przyjęte: `why` jako pary przy regule (nie mapa tekstów) + `styleWord`, teksty spoza słownika (metadata, not-found/error, flash, import po kodzie, `format.ts`, propsy `ui`), `Vary`, `wm_lang` tylko dla panelu + `safeBack`, API bez `locale` (test), `lang` tylko jawny i jedna funkcja linków wspólna z E02, etykiety vs wartości URL, dwa PR-y, `pickLocale` tylko w core, NBSP w asercjach. Odrzucone: lint na stringi JSX (zbyt wiele fałszywych alarmów; zastępuje go przegląd zrzutów PL każdej strony).
- 2026-10-15 — grill: 8 pytań, 1 dla właściciela (#8).
- 2026-10-15 — approved: właściciel (Filip) zatwierdził; obie fazy, najpierw gość, potem panel.
- 2026-10-15 — faza 1 (gość) zaimplementowana.
- 2026-10-15 — faza 2 (panel) zaimplementowana; status `implemented`.

## Realizacja
- **Faza 1 (gość) — 2026-10-15**, gałąź `feat/i18n-guest`, log `.ai/runs/2026-10-15-polish-language-guest.md`. Core: `i18n/locale.ts` (`Locale`, `LOCALES`, `isLocale`, `pickLocale`, typ `Localized`), pary `{ en, pl }` przy regułach w `scoring.ts`, `Factor.whyPl`, `explain`/`styleWord`/`recommendForDish`/`recommendForTable`/`tableWhy`/`budgetNotice`/`tasteWords`/`styleLabel`/`prefsSummary` z `locale = 'en'`; `RecommendationService.forDish(slug, dishId, prefs, limit?, locale?)`, `wineDetails(…, locale?)`, `forTable(…, locale?)`. App: `src/i18n/en.ts` + `pl.ts`, `server/i18n.ts`, proxy z `x-wine-lang` (matcher `/admin`, `/r`), `guestContext` → `locale`, `lang`, `t`, `href`, `langHrefs`; `hrefWith(path, prefs, extra, state)` dokleja `lang` na końcu; `LanguageSwitch`; wszystkie strony gościa na słowniku.
- **Odstępstwa:** (1) **R12 `Vary` nie jest wysyłany** — Next.js 16.3 nadpisuje nagłówek `Vary` każdej strony App Routera (`app-page-runtime`: `res.setHeader('Vary', …)`), zarówno ustawiony w proxy, jak i w `next.config` `headers()` (sprawdzone na `next start`). Strony gościa i panelu są `force-dynamic` z `Cache-Control: private, no-store`, więc żaden cache nie poda złego języka; do powrotu przy cache'owaniu stron (lekcja `nextjs-vary-header-overwritten`). (2) Architektura wspominała `engine/why-pl.ts` (mapa) — zgodnie z changelogiem i R8 użyto par przy regułach, bez mapy. (3) `forDish` ma `locale` jako 5. parametr (po istniejącym `limit`).
- **Faza 2 (panel) — 2026-10-15**, gałąź `feat/i18n-panel`, log `.ai/runs/2026-10-15-polish-language-panel.md`. Proxy bez zmian w logice (`wm_lang` tylko dla `/admin`, nazwa w `server/lang-cookie.ts`). Akcja `setLanguage` (`(admin)/admin/language-actions.ts`): tylko `pl`/`en`, ciasteczko `wm_lang` (httpOnly, SameSite=Lax, `Secure` jak sesja, `Path=/admin`, rok), powrót przez `languageBack` (`safeNext`; ekran logowania zachowuje zwalidowane `next`), `revalidatePath('/admin', 'layout')`, sesja nietknięta. Przełącznik `LanguageSwitch` (komponent kliencki tylko po to, by `back` był bieżącym adresem po nawigacji klienckiej; bez JS działa z adresem z SSR) w stopce `AdminShell` i na A0. Słownik `admin.*` w `en.ts`/`pl.ts`; wszystkie ekrany A0–A12, `forbidden`/`not-found`/`error` (teksty przez kontekst `ErrorTextsProvider`, bo `error.tsx` jest kliencki)/`loading`, `generateMetadata` z szablonem „%s | Panel Wine Match”. Komunikaty po kodzie w `_components/messages.ts`: flash (`saved`/`error`, kody błędów domenowych), błędy logowania, uwagi importu (`ImportIssue.code` + `params`), notatki importu (rozpoznawane po tekście core, brak → EN). Core: każde `err()`/`warn()` ma kod i `params` (pole dodane, `message` EN bez zmian); `SetupStep.state` + `values`; `AdminService.dishDetail/wineDetail/reviewQueue/pairingWorkbench(…, locale = 'en')` — uzasadnienia silnika w języku panelu. `format.ts`: `Intl` z `locale` (`pl`: `09.10.2026, 17:40`, kwoty przez `formatPrice`). `@wine-match/ui`: `LevelMeter` i `MatchGlass` przyjmują `label` (domyślnie EN); `EmptyState`/`ErrorMessage`/`LoadingMessage` dostają teksty ze słownika.
- **Odstępstwa fazy 2:** (1) R12 `Vary` — jak w fazie 1 (Next 16 nadpisuje; strony panelu `no-store`). (2) Notatki importu (`ImportJob.notes: string[]`) nie mają kodów — tłumaczone po znanym tekście core (test pilnuje, że każda notatka core ma tłumaczenie); zmiana typu `notes` byłaby zmianą danych w bazie. (3) Bez E2E panelu PL — AC4 pokrywa smoke (SSR i POST akcji serwerowej bez JS) i test jednostkowy akcji. (4) Historia parowań: nazwa „Removed wine” z core zostaje po angielsku (rzadki przypadek).
