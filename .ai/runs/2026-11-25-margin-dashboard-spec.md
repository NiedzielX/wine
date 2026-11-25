---
started: 2026-11-25 12:33
ended: 2026-11-25 13:10
agent: Claude Code (model not recorded)
spec: .ai/specs/2026-11-25-margin-dashboard.md
outcome: partial
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
- Przegląd niezależny: NIE wykonany, brak narzędzia pod-agentów w tej sesji; `review_independence: none`, powód w sekcji „Przegląd niezależny” specyfikacji. Wykonano tylko przegląd własny.

## Wynik
Specyfikacja `draft` gotowa, 14 decyzji dla człowieka (D1–D14) z rekomendacjami, 11 PR-ów. Do zrobienia: przegląd niezależny, akceptacja człowieka. Nic nie wypchnięte.

## Lekcje
brak
