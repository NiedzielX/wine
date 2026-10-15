---
status: implemented
created: 2026-10-14
owner: Filip
related: [.ai/runs/2026-10-14-mvp-mockups.md]
superseded_by:
---

# Wine Match — wstępna koncepcja MVP i klikalne mockupy

> Specyfikacja zapisana retrospektywnie. Źródłem był brief „Wstępna koncepcja Wine Match — platformy rekomendacji win dla restauracji” przekazany przez właściciela produktu 2026-10-14 i zatwierdzony przez niego jako zakres prac. Szczegóły wymagań są w dokumentach z sekcji „Realizacja”.

## Problem
Goście restauracji nie wiedzą, które wino z karty pasuje do ich dania; sommelier nie dociera do każdego stolika; restauracja nie mierzy sprzedaży wina względem rekomendacji. Skutek: niski Wine Attach Rate.

## Cel i zakres
Koncepcja produktu B2B2C oraz klikalne mockupy (HTML, CSS, TypeScript) aplikacji gościa i panelu sommeliera, działające lokalnie po `npm install` / `npm run dev`, z deterministycznym silnikiem dopasowań bez płatnych API LLM.

**Poza zakresem:** backend, integracja z POS i e-menu, inventory, forecasting, pricing intelligence, marketplace, profile gości.

## Wymagania
- R1 Dokumenty: koncepcja produktu, role, use case’y, user flows, mapa ekranów, specyfikacja ekranów, model danych, API, silnik rekomendacji.
- R2 Aplikacja gościa: danie → wina (2–4, Match Score, „Why it works”, cena kieliszek / butelka), filtry, butelka dla stolika, potwierdzenie dla kelnera.
- R3 Panel: logowanie, dashboard KPI, menu, wina, zarządzanie i review pairingów (Suggested / Approved / Modified / Rejected; Primary / Alternative / Best value), import, publikacja, QR.
- R4 Silnik: `pairing_score(dish, wine)`, deterministyczny, testowalny; pierwszeństwo sommeliera; cena; kieliszek / butelka; stolik.
- R5 UI premium, minimalistyczne, bez eksponowania AI.

## Kryteria akceptacji
- [x] AC1 Wszystkie ścieżki MVP klikalne bez backendu, bez niedziałających przycisków.
- [x] AC2 Brak błędów TypeScript; build przechodzi.
- [x] AC3 Responsywność: brak poziomego przewijania przy 390 / 768 / 1440 px.
- [x] AC4 Testy silnika przechodzą.
- [x] AC5 Projekt spakowany do ZIP i uruchamialny z czystej instalacji.

## Projekt rozwiązania
Vite + czysty TypeScript; hash router; stan w `localStorage` zamiast backendu; silnik w `src/engine/`; fikcyjna restauracja Halka (Warszawa).

## Ryzyka i otwarte pytania
- Import PDF / Excel jest w mockupie symulowany — w produkcji wymaga parsera po stronie serwera (OCR dla skanów).
- Ceny planów subskrypcyjnych w `docs/PRODUCT_CONCEPT.md` są orientacyjne, do walidacji z klientami.

## Realizacja
- Dokumentacja: `docs/*.md`, `README.md`.
- Kod: `src/`, testy: `tests/engine.test.ts` (23 testy).
- Przebieg: `.ai/runs/2026-10-14-mvp-mockups.md`.
- Odstępstwa: interfejs mockupów po angielsku (zgodnie z komunikatami z briefu), dokumentacja po polsku.
