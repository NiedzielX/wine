---
started: 2026-10-15 13:20
ended: 2026-10-15 16:30
agent: Claude Code / claude-opus-5-5 (autorzy specyfikacji i grill), claude-sonnet-5-5 (review krzyżowe)
spec: tworzy specyfikacje (draft) dla E02–E05
outcome: success
related: [.ai/runs/2026-10-15-technical-backlog.md]
---

# Specyfikacje dla backlogu technicznego (lekcja 5: om-spec-writing, review innym modelem, grill)

## Zadanie
Lekcja 5: przełożyć historie z backlogu na specyfikacje, przepuścić je przez review innym modelem i grill me. Właściciel prosi o pracę autonomiczną.

## Przebieg
- `om-spec-writing --autonomous` (lokalna kopia identyczna z upstreamem open-mercato/skills): pytania otwarte rozstrzygnięte jako „Resolved assumptions”, ryzykowne oznaczone ⚠. Każdy autor miał osobny kontekst i wykonał krok 8 (scope cohesion) w świeżym pod-agencie.
- Granularność: jedna specyfikacja na epik; E05 rozdzielony na dwie (zakładanie restauracji i wdrożenie to niezależne zdolności).
- Review krzyżowe: Fable 5.1 przekroczył limit wydatków, więc review zrobił Sonnet 5.5 (inny model niż autor Opus 5.5; GPT/Codex niedostępny na tej maszynie — ta sama „stajnia”, co lekcja wskazuje jako słabsze). Wyniki: E02 0/2/4/6, E03 0/4/5/4, E05-S01 0/0/4/5, E05-S02 0/2/6/6, E04 0/3/8/6 (Critical/High/Medium/Low) plus 11 punktów spójności między specyfikacjami.
- Grill (metoda „grilling” Matta Pococka) prowadzony autonomicznie: rekomendowana odpowiedź przyjmowana, poza decyzjami nieodwracalnymi, osłabiającymi bezpieczeństwo/izolację/BACKWARD_COMPATIBILITY lub sprzecznymi z briefem — te zostają ⚠ dla właściciela. Log w sekcji `Grill log` każdej specyfikacji.
- Przerwa: limit API przerwał agentów fix+grill po zapisie czterech specyfikacji; E04 dokończony po resecie, wymaganie z review E04 (`tier` w `recommendations_viewed`, zakres konwersji, `seedUsageEvents`) dopisane ręcznie do E02.

## Weryfikacja
- Każda specyfikacja ma: frontmatter `status: draft`, Wymagania R1…, User stories, Kryteria akceptacji, Phasing, Implementation Plan, Grill log, Changelog.
- Spójność kontraktów: E04 konsumuje `GuestInteractionRepository` (E02) i `SalesKpiService.getSalesKpis/dataRange` (E03) bez zmian sygnatur; nagłówek `x-wine-match-synthetic: 1` wspólny dla E02 i E05-S02; `restaurant:create` wspólne dla E05-S01 i E05-S02.
- Kod aplikacji bez zmian.

## Wynik
5 specyfikacji w statusie `draft` czeka na akceptację właściciela (AGENTS §3: `approved` nadaje tylko człowiek). Decyzje ⚠ zebrane w opisie PR-a.

## Lekcje
brak
