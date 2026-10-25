---
started: 2026-10-25 14:40
ended: 2026-10-25 15:20
agent: Claude Code
spec: brak — aktualizacja zależności bez zmiany zachowania i wyjątki w bramce audytu (AGENTS §3)
outcome: partial
related: [.ai/runs/2026-10-25-agent-security-hardening.md]
---

# Bramka audytu zależności czerwieni każdy PR: zod do 4.6.6, dateowane wyjątki dla next i undici

## Zadanie
Job `lint` w CI padał na każdym PR (także zmianie samej dokumentacji) w kroku „Dependency audit”. `main` było zielone 2026-10-22, więc przyczyną są nowe advisories z 23–25 października, nie zmiany w kodzie.

## Przebieg
- `npm run audit:gate` lokalnie: `next` (critical, 3 advisories: RCE w optymalizatorze obrazów przy SVG, DoS w Server Actions, RCE w `use cache`), `undici` (high, 3 advisories; przychodzi przez `testcontainers` w `packages/testkit`, nie jest wysyłany), `zod` (high, <4.6.6).
- Wersje z poprawkami a reguła 14 dni z AGENTS §1.1 (dziś 2026-10-25): `zod` 4.6.6 ma 14 dni (2026-10-11), więc **zbumpowane teraz** w `core` i `app` (4.6.5 → 4.6.6, tylko łatka). `next` ≥ 16.4.1 (2026-10-14, 11 dni) i `undici` ≥ 7.30.1 (2026-10-15, 10 dni) są młodsze niż 14 dni.
- Decyzja (rekomendowana): zamiast łamać regułę wieku, **dateowane wyjątki** w `scripts/audit-gate.mjs` do 2026-10-29 dla nazwanych advisories, a po tym terminie bump (`next` 16.4.1 lub nowszy, `undici` 7.30.1 lub nowszy). Dwa z trzech advisories Next są nieosiągalne w tej aplikacji (brak `use cache`, brak SVG w optymalizatorze obrazów); DoS w Server Actions dotyczy aplikacji, ale nic nie jest jeszcze wdrożone.
- Bramka dopasowywała wyjątki po nazwie pakietu, więc wyjątek dla `next` ciszyłby też każdy przyszły advisory Next. Zawężone: wyjątek wymienia advisories, a nowy advisory tego samego pakietu zawodzi bramkę (sprawdzone na kopii skryptu z usuniętym jednym identyfikatorem: kod 1 z komunikatem).
- `npm` przy dodaniu zod przestawił kolejność kluczy w `packages/app/package.json`; przywrócona, żeby diff zawierał tylko zmianę wersji.

## Weryfikacja
- `npm run audit:gate`: kod 0 (high 1, critical 1, oba objęte wyjątkami do 2026-10-29). Test zawężenia: kod 1 przy braku jednego identyfikatora.
- `npm run lint`, `typecheck`, `build`: zielone. `npm test`: 565 + 49 + 62 + 353 + 10 testów. `npm run test:db` (lokalny PostgreSQL 16): 102 testy zielone.
- Nie sprawdzono: e2e z `agent-browser` (nie ma go w środowisku); zod 4.6.6 przeszedł testy walidatorów w `core`, `app` i `db`.

## Wynik
Gałąź gotowa. **Wyjątki wygasają 2026-10-29**: po tym dniu job `lint` znów padnie, dopóki `next` i `undici` nie zostaną zbumpowane do wersji starszych niż 14 dni (`next` ≥ 16.4.1, `undici` ≥ 7.30.1). To jest zadanie do wykonania po tym terminie. Po merge pozostałe otwarte PR-y (#92, #93, #94, #96) muszą zaktualizować gałąź z `main`, żeby `lint` przeszedł (ochrona `main` ma `strict`).

## Lekcje
`.ai/lessons/2026-10-25-audit-gate-new-advisories.md`.
