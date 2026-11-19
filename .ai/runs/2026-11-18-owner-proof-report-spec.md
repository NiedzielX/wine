---
started: 2026-11-18 10:00
ended: 2026-11-18 11:00
agent: Claude Code
spec: .ai/specs/2026-11-18-owner-proof-report.md
outcome: success
related: [.ai/specs/2026-11-18-owner-proof-report.md, .ai/specs/research/benchmarks/2026-11-16-product-strategy-vs-sommelierbot.md]
---

# Specyfikacja `draft`: raport dowodu dla właściciela i GM

## Zadanie
Napisać specyfikację (status `draft`, bez implementacji i bez zatwierdzania) miesięcznego raportu dowodu: Wine Attach Rate przed i po z POS i kodów polecenia, stała baza pilota (D20), uczciwe „za mało danych”, korelacja a przyczynowość, hipoteza zwrotu abonamentu jako treść handlowa.

## Przebieg
- Gałąź `docs/proof-report-spec` z `origin/main`. Strategię (P3) przeczytano z gałęzi `origin/docs/product-strategy-vs-competitors` (`git show`), poza tym brief (D04, D16, D20, A05, Q11), `PRODUCT_CONCEPT.md` §6, `sales-kpi-service.ts`, `sales-kpis.ts`, `kpi-window.ts`, `compare-metric.ts`, specyfikacje importu sprzedaży, kodu polecenia, kalkulatora ROI i subskrypcji (E15).
- Decyzje projektowe: obliczanie na żywo bez migawek; jedna nowa tabela `proof_launch_day` (append-only), bo `restaurant.published_at` jest nadpisywane, a `settings` zapisuje się w całości i jest dostępne dla sommeliera; nowa metoda portu `checkTotalsMarked` zamiast zmiany `CheckTotals`; przedziały Wilsona i Newcombe'a; wolne ID ekranów A32 i A33.
- Przykłady H2–H5 przeliczono niezależnym skryptem (z = 1,96) przed wpisaniem do specyfikacji; H1 policzono ręcznie.
- Zlecenie przeglądu niezależnego należy do agenta nadrzędnego (nie wykonano).

## Weryfikacja
Wyniki `node scripts/check-context.mjs` i `node scripts/secret-scan.mjs` w odpowiedzi dla człowieka i w commicie; zmiana tylko w dokumentach, bez kodu.

## Wynik
Specyfikacja w statusie `draft`, czeka na przegląd niezależny i akceptację właściciela. Kod nie został zmieniony.

## Lekcje
brak
