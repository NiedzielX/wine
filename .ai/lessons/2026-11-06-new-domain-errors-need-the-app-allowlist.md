---
date: 2026-11-06
updated:
area: tooling
status: active
source: .ai/runs/2026-11-06-e12-f2-invitations.md
promoted:
---

# Nowa klasa DomainError musi trafić na listę nazw w `server/domain-errors.ts` i do mapy HTTP

## Kontekst
`InvalidTokenError` i `AlreadyMemberError` (E12 F2) rzucone z serwisu kończyły się 500 w API i `unexpected` w akcjach, choć testy `core` były zielone.

## Przyczyna
`domainError(e)` rozpoznaje błąd tylko po `name` z zamkniętej listy (`NAMES`), bo `instanceof` zawodzi między paczkami Next.js. Nieznana nazwa to dla aplikacji nie-błąd-domenowy: 500, z pełnym `err` w logu.

## Reguła
Dodając klasę `DomainError` w `core`, dopisz jej nazwę do `NAMES` w `packages/app/src/server/domain-errors.ts` i przypadek w `fromDomainError` (`api-auth.ts`) w tym samym kroku, oraz test w `app/tests/unit`, który woła trasę lub akcję i sprawdza kod HTTP.

## Jak sprawdzić
`packages/app/tests/unit/invitations.test.ts` (409 `already_member`, przekierowanie `invalid_token`).
