---
date: 2026-11-06
updated:
area: tooling
status: active
source: .ai/runs/2026-11-06-e12-f2-invitations.md
promoted:
---

# Sekret pokazany raz po akcji serwerowej: stan formularza (`useActionState`), nie URL, ciasteczko ani flash

## Kontekst
Link zaproszenia (E12 F2) istnieje tylko jako skrót w bazie, więc musi trafić do zapraszającego dokładnie raz. Akcje panelu przekierowują z wynikiem w URL (`?saved=`), co dla tokenu oznaczałoby historię przeglądarki i dzienniki proxy.

## Rozwiązanie
`inviteMember(prev, form)` nie przekierowuje, tylko zwraca stan; formularz (`'use client'`, `useActionState`) wyświetla go. React renderuje stan do odpowiedzi na POST także bez JavaScriptu (pole `$ACTION_ID_…` i dodatkowe ukryte pola formularza), więc działa i test e2e z `fetch` może go przesłać wielokrotnym formularzem. Odświeżenie strony (GET) tokenu nie pokazuje.

## Reguła
Wartość, której nie wolno zapisać ani wstawić do adresu, zwracaj jako stan formularza z akcji bez przekierowania. Do komponentu klienckiego przekazuj tylko dane serializowalne (lekcja `client-component-props-are-not-functions`).

## Jak sprawdzić
`invitations.e2e.test.ts`, pierwszy test: link jest w odpowiedzi na POST, nie ma go na stronie ładowanej potem.
