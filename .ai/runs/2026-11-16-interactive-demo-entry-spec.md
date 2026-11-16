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

## Poprawki po przeglądzie niezależnym (2026-11-16, ta sama seria)
Niezależny agent (model niezapisany) przejrzał draft; właściciel przyjął z góry rekomendacje przeglądu (rekomendacja przyjęta przez właściciela w czacie 2026-11-16). Każdą tezę sprawdzono w kodzie przed wpisaniem (`git grep`, odczyt plików); tabela z wynikami jest w specyfikacji, sekcja „Przegląd niezależny”.
- Sprawdzone: prawda dla wszystkich tez przeglądu; odrzuconych brak („sprawdzone: nieprawda”: żadna).
- Zmiany w specyfikacji: `/start` jako główny cel, karta drugorzędna; R3 przepisane (na PostgreSQL `ALLOW_DEMO_DATA=true` przechodzi walidację, `env.ts` l. 137-138; warunek = flaga i tryb ≠ `demo` i istnienie kont); karta tylko dla kont z dostępem do panelu (kelner → `/r/halka/staff`); `/start` w `matcher` `proxy.ts` (odstępstwo od R12 spec. sprzedażowej); droga powrotna (ribbon, link w panelu, `/` → `/start`); `loginAsDemo` + `signIn` + wpisy `check:pages`; `demoAccounts()` bez hashy, `allowDemoData` w `AppEnv`; nagłówki i `noindex`; konkretne AC2; trzy bazy i trzeci projekt Vercela (Q2, Q3; `vercel-hosting` R1/R9/§F1 wymaga dopisku w osobnej zmianie, nie edytowano); blokada konta i `TRUSTED_PROXY_HOPS`; numeracja docs (§17, §12, A0 l. 288); bramki (`check:qa`, `check:pages`, model zagrożeń); przypadki brzegowe.
- `status:` pozostaje `draft` (zatwierdza człowiek). Uzupełniono `author_model: not recorded` i `reviewed_by: not recorded (independent agent, model unknown)`.
- Otwarte: czy `findUserByEmail` wystarcza do „konto istnieje”; czy flaga „bez QR” z `vercel-hosting` R7 będzie przed tą funkcją; czy po `db:seed` menu jest opublikowane (seeder zapisuje wersję 1, do potwierdzenia testem w AC7).

### Weryfikacja (poprawki)
Worktree `/home/user/wine-demo-entry` (gałąź `docs/interactive-demo-entry-rev`, zmergowane `origin/main`), `npx -y npm@11.20.0 install --engine-strict=false`:
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (rozmiar starszych specyfikacji; nowych brak).
- `npm run lint`: czysto.
- `npm run secrets:scan`: 21 trafień, wszystkie na allowliście.
- `npm run audit:process`: PASS 48, FAIL 4 (TEST-05, TEST-06, REL-04, PROD-02: istniejące, bez związku), PARTIAL 1, MANUAL 10; nowych FAIL brak.
- Bez implementacji, bez pusha i PR-a.
