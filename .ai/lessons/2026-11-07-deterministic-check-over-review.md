---
date: 2026-11-07
updated:
area: tooling
status: active
source: .ai/runs/2026-11-07-check-routes.md
promoted:
---

# Błąd, który wrócił mimo review, dostaje sprawdzenie maszynowe: każda trasa API przechodzi przez wrapper

## Kontekst
E21 F1 wymaga, by każdy route handler w `packages/app/src/app/api/**` szedł przez `handle()` / `handlePublic()` / `handleUnscoped()` z `route` (linia logu i metryka `http_requests_total`). W E12 F2 trasy zespołu i zaproszeń trafiły do merge bez `route`; wychwycił to recenzent ręcznie. Ręczne review jest niedeterministyczne, więc ta klasa błędu mogła wrócić.

## Przyczyna
Reguła istniała tylko jako zdanie w dokumencie i punkt listy przeglądu. Typ TypeScript wymusza `route` w opcjach wrappera, ale nie wymusza samego wywołania wrappera (handler może zwrócić `NextResponse` wprost), unikalności etykiety ani poprawnego `write` (POST z `write: false` pomija CSRF).

## Reguła
- Klasę błędu, która wróciła mimo review, zamień w test deterministyczny: czerwony na wadliwym kodzie z właściwego powodu, zielony na poprawionym, wpięty w wymagany job CI (`lint`). Dowód czerwony/zielony zapisz w karcie dowodu w `.ai/runs/`.
- Wyjątki od takiego sprawdzenia tylko przez jawny plik z powodem przy każdym wpisie (`scripts/check-routes.allowlist.json`); nieaktualny wpis ma failować, żeby lista nie gniła.
- Nowy route handler: `export async function METHOD`, jedno `return handle(req, { route: '<wzorzec ze ścieżki>', write: <literał>, … }, …)`. `handlePublic`/`handleUnscoped` wymagają wpisu w `publicRoutes`.
- Wrapper ma być pierwszą instrukcją metody (walidację rób w jego callbacku); dług „kod przed wrapperem” jest w `earlyReturns` (dziś 9 handlerów, K3). Każdy wpis allowlist ma `methods`, bo wyjątek dotyczy metody, nie pliku. Ograniczenia: sprawdzenie czyta tekst (bez parsera TS), nie widzi akcji serwerowych, goły typ obiektowy jako typ zwracany myli skan.

## Jak sprawdzić
`npm run check:routes`; testy `packages/testkit/tests/check-routes.test.ts`; dowód: `.ai/runs/2026-11-07-check-routes.md`.
