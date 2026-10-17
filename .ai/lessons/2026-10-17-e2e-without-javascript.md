---
date: 2026-10-17
updated:
area: tooling
status: active
source: .ai/runs/2026-10-17-e10-f2-opportunity-screens.md
promoted:
---

# E2E „bez JavaScriptu” w agent-browser: blokuj skrypty przed pierwszą stroną, klikaj przez `eval`

## Kontekst
E10 F2 wymagał E2E A6/A14 bez JavaScriptu (AC8). agent-browser 0.39.1 nie ma przełącznika „JavaScript off”. Pierwsza próba (`network route '**/*.js' --abort` po zalogowaniu) nic nie dała: `window.next.router` istniał, strona była zhydratowana. Selektor `button:has-text("…")` (Playwright) kończył się błędem `click … failed`.

## Przyczyna
Skrypty Next.js wczytane przy pierwszej stronie trafiają do pamięci podręcznej przeglądarki; kolejne nawigacje biorą je z cache i trasa (`route`) ich nie widzi. agent-browser przyjmuje zwykłe selektory CSS, bez rozszerzeń Playwrighta.

## Reguła
- Sesja bez JS: `open about:blank` → `network route '**/*.js' --abort` → dopiero potem logowanie i strony (logowanie panelu działa bez JS). Sprawdź w teście, że `window.next?.router` nie istnieje.
- Przycisk po tekście: `eval` z `[...document.querySelectorAll(scope + ' button')].find((b) => b.textContent.trim() === text).click()` — natywny klik wysyła formularz jak przeglądarka bez JS (skrypt strony nie działa, `eval` przez CDP tak). Zakres zawężaj CSS `form:has(input[name="pairingId"][value="…"])`.
- Odczyt danych do testu: `eval` z `fetch('/api/v1/…').then((r) => r.text())` w zalogowanej stronie (to samo pochodzenie, ciasteczko sesji idzie samo).
- Ekran z `loading.tsx` (grupa `(lists)`) sprawdzaj w drugiej sesji z JS.
- Lokalnie: `AGENT_BROWSER_BIN` na kopię 0.39.1 poza repo, `AGENT_BROWSER_EXECUTABLE_PATH` na systemowy Chrome, `TEST_DATABASE_URL` na `embedded-postgres` (lekcja `postgres-without-docker`) — `npm run test:e2e` przechodzi bez Dockera.

## Jak sprawdzić
`packages/app/tests/e2e/opportunities.e2e.test.ts`, test „the page has no script running” (`window.next?.router` → `false`).
