---
started: 2026-10-25 15:50
ended: 2026-10-25 16:35
agent: Claude Code
spec: brak — dokumentacja produktowa (odświeżenie briefu przez om-discover --refresh; decyzja D19)
outcome: success
related: [.ai/runs/2026-10-25-context-engineering-followups.md]
---

# Odświeżyć brief produktu (om-discover --refresh) przez desk research i jawne założenia

## Zadanie
Właściciel (Filip): „zrób to samemu robiąc desk research i dokonując założeń” w miejsce odpowiedzi na pytania discovery (kontakty Q01, próg sukcesu Q02, eksport z POS Q03, kryteria zatrzymania). Skill jest interaktywny; polecenie właściciela zastępuje rozmowę, ale zasady dowodowe skilla zostają: bez wymyślonych badań, propozycje agenta mają status `proposal`.

## Przebieg
- Pięć zapytań wyszukiwarki (wpływ cyfrowej karty win na sprzedaż, produkty dla restauracji, ceny, rynek w Polsce). Próby otwarcia stron źródłowych (Cornell, FSR, UpMenu, BinWise) nie powiodły się (`getaddrinfo ENOTFOUND`), więc wyniki to streszczenia wyszukiwarki: zapisane jako tropy w `.ai/specs/research/benchmarks/2026-10-25-desk-research-leads.md`, bez wpisów `[BENCHMARK]` i poza Coverage.
- Decyzja właściciela zapisana jako D19 (`.ai/specs/research/decisions/2026-10-25-d19-agent-led-discovery-refresh.md`). Propozycje agenta: D20 (miara sukcesu pilotażu: Wine Attach Rate, okno 28 dni przed i po, próg próby 30 rachunków z produktu), D21 (kryteria restauracji pilotażowej z pól wymaganych przez import sprzedaży), Kill criteria K01–K04: wszystkie `proposal`/`[ASSUMPTION]`, bez liczb spoza produktu.
- Czego nie dało się ustalić: kontaktów do rozmów, baseline z POS, zgody restauracji: zostają na Collection plan i w Q01, Q03.
- Odczyt sceptyczny przez niezależnego pod-agenta: brak CRITICAL, 13 uwag. Poprawiłem to, co wynikało ze źródeł (sformułowania o tropach, rozbieżny wiersz D20/D21, tag `[DECISION]` w R06, wydzielenie propozycji agenta z linii `[DOCUMENT]`, brakujące źródło koncepcji w D20, zdanie o gotowości w Decision summary, przeliczenie Coverage). Pięć uwag to decyzje człowieka (jednostka i okno dla K04, próg zmiany dla K03, wpływ uchylenia D09 na odświeżoną wersję, terminy rozmów, dopuszczalność pilotażu bez POS): trafiły do Open questions Q09–Q12, nic nie zostało rozstrzygnięte za właściciela.

## Weryfikacja
- Liczby w briefie porównane z notatką tropów, `SALES_REQUIRED_FIELDS` (`packages/core/src/import/types.ts`) i wierszem „Sales (E04 F2)” w `docs/SCREEN_SPECIFICATION.md` przez pod-agenta i po poprawkach przeze mnie.
- Coverage przeliczone skryptem według reguł `evidence-tiers.md`: 60 claims — 44 sourced (document 37, product 7), 0 synthetic, 16 assumed; poprzednia wartość 44 nie obejmowała decyzji dopisanych po 2026-10-15.
- Wiersze D19–D21 mają 10 komórek jak reszta tabeli. `npm run check:context`: 0 błędów; `npm run secrets:scan`: bez nowych trafień. Bez zmian w kodzie, więc `lint`, `typecheck`, `test`, `build` nie dotyczą.

## Wynik
Brief odświeżony; Decision summary, A02/A05/A06, Kill criteria, Q01–Q03, Collection plan zaktualizowane. Najważniejsza nowa informacja: założenie A06 („brak dobrej alternatywy”) ma przeciwne tropy (BinWise, SOMM'IT, CorkGuru wg opisów producentów i katalogów), do sprawdzenia w źródle (C04). Nic z desk researchu nie potwierdza A01–A05. Zadania właściciela: Q09–Q12, potwierdzenie D20, D21 i kryteriów zatrzymania, kontakty do rozmów (Q01).

## Lekcje
brak (powtarzalna zasada „agent nie wymyśla badań, tropy z wyszukiwarki to nie benchmark” jest w samym skillu)
