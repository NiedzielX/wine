---
status: implemented
created: 2026-10-15
owner: Filip
related: [.ai/specs/implemented/2026-10-15-polish-language.md, .ai/specs/product-brief.md, BACKWARD_COMPATIBILITY.md]
---

# Treści dwujęzyczne (PL/EN) i przełącznik „Polski / English”

> Akceptacja: właściciel w zleceniu („Zrób treści dwujęzyczne… Napisz spec i implementuj”, „Chcę na górze przycisk Polish / English i wszystkie treści przetłumaczone”, 2026-10-15). Decyzje poniżej wybrano jako najbardziej odwracalne; właściciel może je zmienić w review PR-a.

## 📝 TLDR
Interfejs jest już PL/EN, ale treści restauracji (dania, opisy, notatki o winach, notatki sommeliera, miasto) mają jedną wersję — po polsku gość widzi „Duck breast”. **Proponujemy** tłumaczenia treści: każde danie, wino, notatka sommeliera i dane restauracji mogą mieć wersję PL i EN; gość i panel pokazują wersję w wybranym języku (brak tłumaczenia → wersja bazowa). Tłumaczenia wchodzą przez import (kolumny `_pl` / `_en`) i przez formularz w panelu. Dane demo Halki dostają pełne tłumaczenie PL. Przełącznik języka ma etykiety „Polski / English” i jest na górze każdej strony gościa i panelu.

## Problem
Po zmianie języka na polski karta Halki dalej mówi po angielsku (nazwy i opisy dań, notatki o winach, notatki sommeliera, „Warsaw”). Właściciel: „wszystkie treści przetłumaczone”. Restauracje w Polsce mają gości polsko- i anglojęzycznych, więc jedna wersja treści nie wystarczy.

## Cel i zakres
Dwujęzyczne treści restauracji, edytowalne w imporcie i panelu, wyświetlane w języku gościa / użytkownika panelu; przełącznik „Polski / English” na górze.
**Poza zakresem:** tłumaczenie maszynowe (restauracja wpisuje oba języki; dane demo tłumaczy zespół), nazwy własne win i producentów (nie tłumaczymy „Savigny-lès-Beaune”), więcej niż dwa języki (struktura na to pozwala), publiczne API `/api/v1` (zwraca wersję bazową jak dziś — BC §2).

## Wymagania
- **R1** Tłumaczone pola: **danie** — `name`, `description`; **wino** — `tastingNote`, `region`, `country`; **para** — `comment` (notatka sommeliera); **restauracja** — `tagline`, `city`. Pole bazowe zostaje (wersja w języku treści restauracji); tłumaczenia w `translations: { pl?: {...}, en?: {...} }` per encja.
- **R2** Restauracja ma `contentLocale: 'pl' | 'en'` (język pól bazowych). Istniejące dane: `en`. Halka demo: `en` z pełnym `pl`.
- **R3** Wyświetlanie: `localize(entity, locale)` w `core` zwraca pola w danym języku: tłumaczenie → pole bazowe, gdy `locale === contentLocale` → pole bazowe jako zapas. Tak samo dla gościa (G0–G9) i panelu (A1–A12). Silnik i ranking bez zmian.
- **R4** Opublikowana migawka niesie tłumaczenia (gość widzi tłumaczenia z ostatniej publikacji; zmiana tłumaczenia to zmiana do publikacji jak każda inna).
- **R5** Import menu i karty win: dodatkowe kolumny `name_pl`, `name_en`, `description_pl`, `description_en` (menu) i `tasting_note_pl`, `tasting_note_en`, `region_pl`, `region_en`, `country_pl`, `country_en` (wina), z synonimami PL/EN (np. „nazwa (pl)”, „opis EN”). Kolumny bez sufiksu jak dziś → pola bazowe. Podgląd importu pokazuje obie wersje.
- **R6** Panel: na szczegółach dania (A3) i wina (A5) sekcja „Tłumaczenia” z formularzem PL/EN (pola z R1); zapis akcją serwerową przez serwis `core` z `actor`, uprawnienie `import.manage` (mają je wszystkie role panelu poza kelnerem), `revalidatePath(…, 'layout')`; notatka sommeliera (A6) ma pola PL i EN. Ustawienia restauracji (A10 Setup): `contentLocale`, `tagline` i `city` w obu językach.
- **R7** Przełącznik języka: etykiety „Polski” i „English” (pełne nazwy, każda we własnym języku), aktywny `aria-current`; **na górze** każdej strony gościa (top bar; na G0 w nagłówku) i panelu (górny pasek treści, nie stopka nawigacji); działa bez JS; na 390 px mieści się bez poziomego przewijania (na wąskim ekranie skróty „PL / EN” wizualnie, pełne nazwy w `aria-label`).
- **R8** Dane demo Halki: pełne tłumaczenie PL wszystkich dań, opisów, notatek o winach, regionów i krajów, notatek sommeliera, `tagline` i `city` („Warszawa”).
- **R9** Migracja: kolumna `translations jsonb not null default '{}'` w `dish`, `wine`, `restaurant`; `comment_translations jsonb not null default '{}'` w `pairing`; `content_locale text not null default 'en'` w `restaurant`; `up` i `down`; seeder uzupełnia tłumaczenia Halki idempotentnie.
- **R10** API `/api/v1` bez zmian kontraktu (pola bazowe); smoke to sprawdza.

## Resolved assumptions (autonomous defaults)
| # | Pytanie | Odpowiedź | Uzasadnienie |
|---|---|---|---|
| A1 | Kolumny `name_pl`/`name_en` czy JSON? | JSON `translations` per encja. | Jedna kolumna na encję, łatwe dodanie języka; zapytania nie filtrują po tłumaczeniach. |
| A2 | Język pól bazowych? | `contentLocale` restauracji (domyślnie `en`). | Zachowuje istniejące dane bez migracji treści. |
| A3 | Tłumaczyć nazwy win? | Nie (nazwy własne); tłumaczymy notatkę, region, kraj. | Sommelierzy podają nazwy win w oryginale. |
| A4 | Uprawnienie do edycji tłumaczeń | `import.manage`. | Te same osoby, które wgrywają menu i kartę. |
| A5 | API `/api/v1` | Bez zmian (wersja bazowa). | BC §2; `lang` w API — osobna spec. |
| A6 | Etykieta przełącznika | „Polski” / „English”. | Właściciel: „przycisk Polish / English”; nazwa języka we własnym języku to standard. |
| A7 | Brak tłumaczenia | wersja bazowa, bez znacznika. | Gość nie widzi pustych pól. |

## Architektura
- **Core:** typy `Translations<T>`; `Dish.translations`, `Wine.translations`, `Pairing.commentTranslations`, `Restaurant.translations`, `Restaurant.contentLocale`; `localize*` w `core/src/i18n/content.ts`; serwisy gościa i panelu wywołują `localize` z `locale`; nowa komenda `CatalogService`/`SommelierService` (zgodnie z konwencją komend, `actor`, `expectedVersion`) do zapisu tłumaczeń; walidatory Zod `strictObject`; import: mapowanie kolumn z sufiksem języka, plan zapisu z tłumaczeniami; migawka publikacji z tłumaczeniami; pamięciowe repozytoria i kontrakt.
- **Db:** encje (`defineEntity`, `json`), migracja (R9), repozytoria PostgreSQL, mappery, seeder.
- **App:** `LanguageSwitch` z etykietami „Polski / English” na górze (gość: top bar i nagłówek G0; panel: górny pasek w `AdminShell`); sekcje „Tłumaczenia” na A3, A5; pola PL/EN notatki na A6; Setup A10.
- **Docs:** DATA_MODEL (pola), API_SPECIFICATION (bez zmian, notka), SCREEN_SPECIFICATION (A3/A5/A6/A10, przełącznik), BC §3 (nowe kolumny) i §6 (kolumny importu), brief (D12: treści PL/EN).

## Edge Cases & Failure Scenarios
| Sytuacja | Zachowanie |
|---|---|
| Tylko jedna wersja | gość w drugim języku widzi wersję bazową. |
| Import bez kolumn `_pl/_en` | jak dziś; istniejące tłumaczenia nie są kasowane, chyba że kolumna jest w pliku i pusta → ostrzeżenie w podglądzie i brak zmiany. |
| Restauracja zmienia `contentLocale` | pola bazowe zostają; tylko ich interpretacja się zmienia — ostrzeżenie w Setup. |
| Tłumaczenie dłuższe niż limit pola bazowego | ten sam limit walidacji co pole bazowe. |
| Klucz `__proto__` w JSON tłumaczeń | odrzucony przez `strictObject` (lekcja client-chosen-keys). |

## Ryzyka
- Migracja schematu (`risk-high` wg SDLC): addytywna, z wartościami domyślnymi, `down` usuwa kolumny; test `up`/`down` w `test:db`.
- Zmiana kształtu migawki publikacji: stare migawki bez tłumaczeń czytane z `{}`.
- Jakość polskich tłumaczeń demo — do przeglądu przez sommeliera.

## Decyzje w grze
D11 (interfejs PL/EN) rozszerzone o treści → nowa decyzja **D12** w briefie. N04 bez zmian. BC §2 bez zmian, §3 i §6 rozszerzone addytywnie.

## User stories
- **Gość z polskim telefonem** skanuje QR → „Wybierz danie” i „Pierś z kaczki” zamiast „Duck breast” → wina z polską notatką sommeliera i polskim opisem.
- **Turysta** dotyka „English” na górze → całe menu i notatki po angielsku.
- **Sommelier** wgrywa kartę win z kolumnami `tasting_note_pl` i `tasting_note_en` → podgląd pokazuje obie → zatwierdza → publikuje → goście widzą swoje wersje.
- **Wine Director** poprawia polski opis dania w panelu → zapis → „Opublikuj zmiany” → gość widzi poprawkę.

## Kryteria akceptacji
- [x] AC1 (R3, R8) `/r/halka?lang=pl`: polskie nazwy i opisy dań, „Warszawa”; G3 kaczki: polska notatka sommeliera i opis wina; `?lang=en`: wersja angielska. Smoke.
- [x] AC2 (R7) Przełącznik „Polski / English” na górze G0, G3, G5, G7, A0 i A1; bez JS; 390 px bez poziomego przewijania. Smoke + zrzuty.
- [x] AC3 (R5) Import CSV z kolumnami `name_pl`, `description_pl` (fixture) zapisuje tłumaczenia; test parsera i serwisu.
- [x] AC4 (R6) Zapis tłumaczenia dania w panelu (akcja serwerowa) → po publikacji gość widzi zmianę; odmowa dla kelnera; test serwisu + smoke/E2E.
- [ ] AC5 (R4, R9) Migracja `up`/`down` (`test:db`), `schema:check` zgodny; migawka publikacji z tłumaczeniami. — migawka z tłumaczeniami: zweryfikowana (kontrakt na pamięci); testy `up`/`down` i seedera napisane w `repositories.integration.test.ts`, **nieuruchomione lokalnie** (brak PostgreSQL/Dockera), `schema:check` nieuruchomiony, snapshoty `.snapshot-*.json` uzupełnione ręcznie — do potwierdzenia w CI.
- [x] AC6 (R10) `/api/v1/public/restaurants/halka/menu` zwraca nazwy bazowe (bez zmian). Smoke.
- [ ] AC7 `lint`, `typecheck`, `check:boundaries`, `test`, `test:db`, `build`, smoke — zielone; docs zaktualizowane. — zielone lokalnie wszystko poza `test:db` (brak bazy; do CI); docs zaktualizowane.

## 📋 Phasing
- **Faza 1:** model, migracja, core `localize`, migawka, dane demo PL, gość, przełącznik „Polski / English” (gość i panel).
- **Faza 2:** panel — wyświetlanie w języku, formularze tłumaczeń (A3, A5, A6, A10), import kolumn `_pl/_en`.
Obie fazy w jednym PR-ze, jeśli bramka przejdzie; inaczej faza 2 osobno.

## 📋 Implementation Plan
1. Core: typy, `localize`, walidatory, kontrakt repozytoriów, pamięciowe repozytoria, dane demo PL, migawka.
2. Db: encje, migracja, repozytoria, mappery, seeder; `test:db`, `schema:check`.
3. Gość: serwisy z `locale` → `localize`; przełącznik na górze.
4. Panel: wyświetlanie przez `localize`; formularze tłumaczeń i komenda zapisu; Setup `contentLocale`.
5. Import: kolumny z sufiksem języka, podgląd, plan zapisu; fixture.
6. Smoke, testy, docs, brief D12, BC §3/§6.

## Grill log
| # | Pytanie | Odpowiedź | Przyjęte przez |
|---|---|---|---|
| 1 | JSON tłumaczeń zamiast kolumn per język? | Tak | agent-default |
| 2 | Nazwy win bez tłumaczenia? | Tak | agent-default |
| 3 | Brak tłumaczenia → wersja bazowa bez znacznika? | Tak | agent-default |
| 4 | API bez zmian? | Tak | agent-default |
| 5 | Etykiety „Polski / English” na górze, skróty na 390 px? | Tak | owner (zlecenie) |

## Changelog
- 2026-10-15 — draft i akceptacja w zleceniu właściciela (om-spec-writing --autonomous; review krzyżowy pominięty na prośbę o szybkość — do wykonania w review PR-a).

## Realizacja

Zrealizowano 2026-10-15 (obie fazy w jednym przebiegu, bez commitu — gałąź `feat/bilingual-content`). Log: `.ai/runs/2026-10-15-bilingual-content.md`.

- **Core:** `i18n/content.ts` (typy `Translations<T>`, `localize*`, `cleanTranslations` przez `Object.fromEntries`, `countContentChanges`, migawka `ContentSnapshot`), pola `translations` / `contentLocale` / `commentTranslations` w typach domenowych, walidatory `validators/catalog/translations.schema.ts` (`strictObject`), port `ContentWriteRepository` + `PublishRepository.publishedContent`, komenda `TranslationService` z czystymi regułami `translation-rules.ts` (`expectedVersion` = odcisk tłumaczeń, bo dania i wina nie mają kolumny wersji), `SommelierService.setNote` (notatka + tłumaczenia, ta sama reguła 140 znaków), serwisy gościa i panelu lokalizują przy podanym `locale`, publikacja liczy zmiany tłumaczeń jako niepublikowane zmiany. Import: kolumny `_pl` / `_en` z synonimami, pusta komórka → `translation_empty`, plan scala tłumaczenia.
- **Db:** encje (`json` + `defaultRaw('{}')`, `content_locale` text), migracja `Migration20261015140000_bilingual_content` (up/down), snapshoty `.snapshot-*.json` uzupełnione ręcznie (bez bazy nie da się uruchomić `migration:create` ani `schema:check`), `PgContentWriteRepository` (blokada wiersza + porównanie), migawka publikacji z `content`, seeder uzupełnia tłumaczenia Halki idempotentnie (także `content` wersji 1 dema).
- **App:** gość i panel pokazują treści przez `localize`; przełącznik „Polski / English” na górze (wąsko „PL / EN”, pełna nazwa w `aria-label`); formularze tłumaczeń A3/A5, pola PL/EN notatki A6, karta języka treści A10; podgląd importu pokazuje kolumny tłumaczeń.
- **Odstępstwa:** (1) tłumaczenia w języku `contentLocale` są dozwolone i mają pierwszeństwo przed polem bazowym (localize = tłumaczenie → pole bazowe); (2) dane restauracji (`contentLocale`, hasło, miasto) zapisuje uprawnienie `import.manage`, jak resztę tłumaczeń (A4), a nie `restaurant.edit`; (3) `actor` komend tłumaczeń nie jest zapisywany (dania/wina nie mają historii decyzji); (4) przykładowe pliki `/api/v1/import-samples` bez kolumn tłumaczeń.

