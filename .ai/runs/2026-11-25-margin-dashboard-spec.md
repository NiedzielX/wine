---
started: 2026-11-25 12:33
ended: 2026-11-25 14:05
agent: Claude Code (model not recorded)
spec: .ai/specs/2026-11-25-margin-dashboard.md
outcome: success
related: [.ai/specs/2026-11-18-owner-proof-report.md, .ai/specs/2026-11-18-restaurant-picks.md]
---

# Napisać specyfikację „Pulpit marży restauracji” (status draft, bez implementacji)

## Zadanie
Specyfikacja w statusie `draft` według szablonu z `.ai/docs/process-templates.md`: skąd dane o koszcie, definicje metryk, ekrany, uprawnienia, prywatność, zgodność z silnikiem, podział na małe PR-y, AC, ryzyka i decyzje dla człowieka. Potem przegląd niezależny świeżym pod-agentem. Bez implementacji, bez `approved`, bez push i PR.

## Przebieg
- 12:33 Gałąź `docs/margin-dashboard-spec` z `origin/main` (97d359f). Przeczytane: lekcje, szablon, raport wyników (E-proof), wybory restauracji, E04 (`sales-kpis.ts`), E09 (kod polecenia), strategia (P12), brief (D22–D25, R06, N02–N04), uprawnienia, SCREEN_MAP, standardy §10–§12.
- Ustalenia z kodu: w repozytorium nie ma pola kosztu (`cost` w imporcie menu to synonim ceny); `sales_record` nie ma nazwy ani wina pozycji (E03 Q10, Q18), więc marży na wino ze sprzedaży z POS nie da się policzyć; kod polecenia ma `wineId` i `serving`, więc marżę z zamówionych poleceń da się policzyć z karty; `recommendation_code` nie ma flagi `pick`; A33 i A34 zajmuje raport wyników, A32 edycja katalogu, pierwszy wolny numer to A35.

## Weryfikacja
- `node scripts/check-context.mjs`: 0 errors, 35 warnings (te same co przed zmianą, żadne nie dotyczy nowego pliku); spec 37 161 B (< 40 960).
- `node scripts/check-qa-scenarios.mjs`: 156 scenarios, all linked.
- `node scripts/secret-scan.mjs`: 22 matches, all on the allowlist.
- Liczby przykładów M1–M6 przeliczone w `node` niezależnie od tekstu.
- Pierwsza wersja: przegląd niezależny nie wykonany (brak narzędzia pod-agentów); wykonany później, patrz „Poprawki po przeglądzie”.

## Poprawki po przeglądzie
Przegląd niezależny wykonał agent w świeżym kontekście (inny model niż autor; pierwsza wersja nie miała go z powodu braku narzędzia pod-agentów w mojej sesji). Werdykt: gotowe po poprawkach. Poprawiono w `.ai/specs/2026-11-25-margin-dashboard.md`:
- B1: metryka przemianowana na „marżę wina wskazanego w poleceniu” (porcja z wyboru gościa, domyślnie butelka; POS łączy kod z rachunkiem), D15, test z domyślną porcją; jawna porcja przy kodzie jako opcjonalny PR14.
- W1–W10 i drobne 1–17: kolejność i podział PR (PR0–PR14), `costsVersion` z `ETag`/`If-Match`/428 i zapis zbiorczy, symulator bez zmian z dołożoną marżą po stronie `MarginReportService`, progi podpowiedzi z przykładem M7, mediana parzysta i punkt odniesienia, usunięcie konwersji z etykietą i flagi `pick`, kanarek dla wartości pochodnych i kanały boczne, PR0 (import nie zamienia kosztu w cenę), N04 (D17), D4 z opcją, walidacja `C` jako tekst, FK i 404, logi, `check:boundaries`, demo, VAT, tabela planu produktu, `costHistory`.
- Odłożone z powodem: ustawienie VAT per lokal (D2), historia kosztu (D12), flaga `pick` i pomiar etykiety (D7).
- Decyzje przeniesione: alternatywy D1–D17 do `.ai/specs/research/2026-11-25-margin-dashboard-decisions.md` (spec 35 839 B, limit 40 960). `review_independence: different-model`.
- Weryfikacja po poprawkach: `check-context` 0 błędów, 35 ostrzeżeń (bez zmian); `check-qa-scenarios` 156 OK; `secret-scan` 22 na allowliście; liczby M5 (`s`, przedział) i M4 (mediana 43,9) przeliczone w `node`.

## Wynik
Specyfikacja `draft` po przeglądzie niezależnym, 17 decyzji dla człowieka (D1–D17) z rekomendacjami, 15 PR-ów (PR0–PR14). Do zrobienia: akceptacja człowieka. Nic nie wypchnięte.

## Lekcje
brak
