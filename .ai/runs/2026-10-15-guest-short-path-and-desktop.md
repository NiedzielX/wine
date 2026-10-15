---
started: 2026-10-15 17:10
ended: 2026-10-15 18:10
agent: Claude Code / claude-opus-5-5 (review: claude-sonnet-5-5)
spec: .ai/specs/implemented/2026-10-15-guest-short-path-and-desktop.md
outcome: success
related: [.ai/specs/2026-10-15-guest-usage-events.md]
---

# Krótsza ścieżka gościa i widok desktop

## Zadanie
Właściciel: widok desktop (dotąd tylko mobile) i krótsza droga do wina bez wybierania preferencji przy każdym daniu.

## Przebieg
- Spec draft → review Sonnet 5.5 (3 High: przełączanie serwowania, przekierowanie gubiące query, `dish_viewed` niemożliwy na G3; 6 Medium) → poprawki → grill (8 pytań) → akceptacja właściciela (z usunięciem `dish_viewed` w E02).
- G0 pokazuje menu pod nagłówkiem; danie → G3 jednym kliknięciem; G2 → 308 w `next.config.ts`; szybkie preferencje na G3; preferencje w linkach (menu, Back, tryby, stolik — ukryte pola GET).
- Desktop: kontener 1200 px, `GuestColumns` (treść pierwsza w DOM, `aside` z lewej przez `order`), panel Refine z prawej, G5–G9 w kolumnie 720 px.
- Telefon: nagłówek skrócony (Wine Director pod menu), żeby menu zaczynało się na pierwszym ekranie.
- Dokumenty: SCREEN_MAP, SCREEN_SPECIFICATION (G0–G3), USER_FLOWS §1, USE_CASES UC-01, PRODUCT_CONCEPT §8 p.4, BACKWARD_COMPATIBILITY §1; changelog E02.
- `packages/app/AGENTS.md`: blok reguł dopisany automatycznie przez `next dev` (Next.js 16) — zatwierdzony razem, żeby drzewo było czyste.

## Weryfikacja
- `npm run lint`, `typecheck`, `check:boundaries`, `test`, `build` — exit 0.
- `npm start` (DATA_SOURCE=memory, ALLOW_DEMO_DATA=true, AUTH_COOKIE_SECURE=false) + `node scripts/smoke.mjs http://localhost:3002 halka` — „All smoke checks passed”.
- Na `next dev` smoke ma 1 błąd „dashboard responses are never cached” — ten sam na `main` (dev nadpisuje Cache-Control), nie dotyczy buildu.
- Przeglądarka: 390×844 (G0 z menu, G3 z szybkimi preferencjami), 1440×900 (G0, G3, panel Refine, G5, G7); `scrollWidth == clientWidth` dla G0, G1, G3, G4, G5, G9 przy 390/1024/1440.
- Bez JS: cała ścieżka to linki i formularze GET renderowane na serwerze (sprawdzone na HTML z `curl`); E2E w CI.

## Wynik
Gotowe obie fazy. Do zrobienia osobno: menu w kolumnie bocznej G3 pobierane także na telefonie (ukryte) — dwa zapytania więcej, optymalizacja później (spec, grill #7).

## Lekcje
brak
