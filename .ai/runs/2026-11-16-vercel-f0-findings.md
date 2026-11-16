---
started: 2026-11-16 12:10
ended: 2026-11-16 12:25
agent: Claude Code
spec: .ai/specs/2026-11-15-vercel-hosting.md
outcome: success
related: [.ai/runs/2026-11-15-vercel-hosting-spec.md]
---

# Zapisać wyniki spike'a F0 na Vercelu (demo działa)

## Zadanie
Właściciel zaimportował repozytorium na Vercel i potwierdził, że demo działa pod `https://wine-nhlf.vercel.app`. Zapisać ustalenia z logu budowy i relacji właściciela w specyfikacji i w runbooku.

## Przebieg
- Z logu budowy: pierwsza próba z Root Directory `./` i presetem Vite padła `STATIC_BUILD_NO_OUT_DIR`; instalacja i `next build` przeszły. Poprawka ustawień (Root Directory `packages/app`, preset Next.js, cztery zmienne demo) i wdrożenie zadziałało wg właściciela.
- Z sesji agenta nie da się sprawdzić adresu (proxy sesji blokuje `*.vercel.app`, `vercel.com`), więc w specyfikacji jest tylko to, co zgłosił właściciel i co widać w logu; reszta jako „nie ustalono”.
- Sugerowany przez Vercel `vercel.json` z wieloma serwisami odrzucony (opublikowałby `mockups` i Storybook, błędne trasy); jedna usługa Next.js w `packages/app`.
- Zmiany: sekcja „Wyniki spike'a F0” w specyfikacji (w „Realizacji”, status bez zmian) i nowa sekcja 17 w `docs/DEPLOYMENT.md`.

## Weryfikacja
`npm run check:context` do uruchomienia przed PR-em (patrz wynik w PR). Bez zmian w kodzie.

## Wynik
Demo w trybie pamięci na Vercelu działa wg właściciela. Otwarte: region funkcji (UE), Deployment Protection w planie Hobby, treść `health`, wszystko z bazą (konto u dostawcy bazy), zatwierdzenie specyfikacji przez właściciela.

## Lekcje
brak (ustalenie opisane w `docs/DEPLOYMENT.md` §17)
