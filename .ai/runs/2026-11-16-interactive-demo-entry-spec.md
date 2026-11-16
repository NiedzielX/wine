---
started: 2026-11-16 13:00
ended: 2026-11-16 13:20
agent: Claude Code
spec: .ai/specs/2026-11-16-interactive-demo-entry.md
outcome: partial
related: [.ai/runs/2026-11-16-vercel-f0-findings.md]
---

# Łatwe wejście do interaktywnego dema (draft specyfikacji)

## Zadanie
Uwaga właściciela: skoro to demo, potrzebne jest łatwe wejście do konta administratora i pozostałych funkcji.

## Przebieg
- Sprawdzone w kodzie: konta demo (`packages/core/src/demo/users.ts`: Wine Director, General Manager, kelner; `DEMO_PASSWORD`), uprawnienia (`permissions.ts`: kelner bez `panel.view`), tryb `SHOWCASE_MODE=demo` (tylko odczyt, bez kont, R9 specyfikacji sprzedażowej) i `calculator`.
- Draft specyfikacji: karta kont demo na `/admin/login` i strona startowa, tylko gdy `ALLOW_DEMO_DATA=true` i bez trybu `demo`. Trzy pytania z rekomendacjami (miejsce strony, trwałość zapisów w pamięci, publiczny a chroniony adres).
- Niezależny przegląd nie wykonany (przed `approved`).

## Weryfikacja
Dokumentacja; `check:context` do uruchomienia przed PR-em.

## Wynik
Draft, `status: draft`, czeka na przegląd i akceptację właściciela; PR po zwolnieniu slotu (limit 3 PR-ów).

## Lekcje
brak
