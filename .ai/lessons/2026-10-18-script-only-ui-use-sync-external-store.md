---
date: 2026-10-18
updated:
area: guest-ui
status: active
source: .ai/runs/2026-10-18-e08-f2-waiter-table.md
promoted:
---

# Element widoczny tylko z JavaScriptem: `useSyncExternalStore`, nie `setState` w `useEffect`

## Kontekst
E08 F2 dodał pole „Szukaj dania” na G11, które ma istnieć wyłącznie z JavaScriptem (bez JS strona działa na kotwicach sekcji, a martwe pole wprowadzałoby w błąd). Pierwsza wersja: `const [ready, setReady] = useState(false); useEffect(() => setReady(true), [])`. `npm run lint` (oxlint) odrzuca to regułą `react(set-state-in-effect)`.

## Przyczyna
Synchroniczne `setState` w efekcie wymusza drugi render; oxlint w projekcie traktuje to jako błąd (`--deny-warnings`).

## Reguła
Komponent kliencki, który ma się pojawić dopiero po uruchomieniu skryptu, czyta „czy działa JS” przez `useSyncExternalStore(noop, () => true, () => false)` (`noop = () => () => {}`): serwer i hydratacja dostają `false` (brak elementu w HTML, brak rozjazdu hydratacji), klient po hydratacji — `true`. Przykład: `packages/app/src/app/(guest)/_components/dish-search.tsx`.

## Jak sprawdzić
`npm run lint`; test SSR strony nie zawiera elementu (`staff-table.test.ts`: brak `type="search"`), a E2E bez JS (`staff-table.e2e.test.ts`) — 0 pól wyszukiwania.
