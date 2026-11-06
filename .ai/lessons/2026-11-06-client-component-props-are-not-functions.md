---
date: 2026-11-06
updated:
area: tooling
status: active
source: .ai/runs/2026-11-06-e12-f2-invitations.md
promoted:
---

# Do komponentu klienckiego nie przekazuj funkcji (np. tekstów z i18n jako lambd): vitest tego nie widzi, strona pada dopiero na zbudowanej aplikacji

## Kontekst
Formularz zaproszeń w A15 (`InviteForm`, `'use client'`) dostał z komponentu serwerowego `labels.createdText` z słownika i18n, który jest funkcją `(email, role) => string`. Test strony przez `prerender` w Vitest przechodził. Zbudowana aplikacja odpowiadała 500 na `/admin/{slug}/team` ("Functions cannot be passed directly to Client Components"), a strona A15 w e2e nie miała formularza.

## Przyczyna
`prerender` w testach renderuje drzewo bez serializacji RSC, więc granica serwer/klient nie jest sprawdzana. Prawdziwy serwer serializuje propsy komponentu klienckiego i funkcja (poza akcjami serwerowymi) tego nie przejdzie.

## Reguła
Do komponentu klienckiego przekazuj tylko dane serializowalne. Tekst z miejscami na wartości to szablon (`'For {email}, as {role}'`) wypełniany w kliencie, nie funkcja ze słownika. Test strony z komponentem klienckim w propsach nie wystarcza: sprawdź go na zbudowanej aplikacji (e2e z `fetch` na `next start`).

## Jak sprawdzić
`packages/app/tests/e2e/invitations.e2e.test.ts` (A15 musi oddać formularz z polem `email`); klucz `admin.team.invite.createdText` w `en.ts` i `pl.ts`.
