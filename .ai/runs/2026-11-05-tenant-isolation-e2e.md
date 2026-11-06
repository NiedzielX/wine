---
started: 2026-11-05 17:00
ended: 2026-11-05 17:40
agent: Claude Code / claude-sonnet-5-5
spec: .ai/specs/2026-10-25-agent-security-hardening.md (wymaganie „user A cannot reach user B's data”, issue #95)
outcome: success
related: [.ai/runs/2026-11-05-bughunt-url-ids.md]
---

# Test izolacji restauracji na PostgreSQL (issue #95)

## Zadanie
Issue #95: brakowało testu łączącego sesję użytkownika restauracji A z panelem i API restauracji B na PostgreSQL. Zależność #24 (`restaurant:create`) jest spełniona (global-setup tworzy `bistro-e2e`).

## Przebieg
- Test e2e (zwykły `fetch`, bez przeglądarki): manager Halki wobec panelu i API drugiej restauracji (odczyty i zapisy), manager poza rolą w swojej restauracji, kelner bez logowania do panelu.
- Zachowanie kelnera sprawdzone na działającej aplikacji (403 `no_panel_access`) i dopiero potem przypięte w teście, bez rozgałęzienia.
- Dowód, że test ma zęby: z zepsutym `membershipFor` (zwraca pierwsze członkostwo niezależnie od slugu) i przebudowaną aplikacją `GET /admin/bistro-e2e` daje 200 zamiast 403 i test pada; po cofnięciu przechodzi.

## Weryfikacja
`npm run build`, e2e `tenant-isolation` (2 testy zielone), `check:qa`, `lint`, `check:context`, `secrets:scan`: wyniki w opisie PR.

## Wynik
Brak błędu aplikacji: izolacja działa. Test zostaje jako zabezpieczenie przed regresją.

## Lekcje
brak
