---
date: 2026-11-18
updated:
area: testing
status: active
source: .ai/runs/2026-11-18-e2e-t33-flake.md
promoted:
---

# Dwa odczyty tej samej strony Next.js nie są bajt w bajt równe: kolejność wierszy Flight w HTML jest wyścigiem

## Kontekst
`access-boundaries-guest.e2e.test.ts` (T-33) porównywał `toEqual` dwa odczyty 29 powierzchni gościa i padał sporadycznie (CI na PR #171 dwa razy z rzędu; lokalnie 2 z 3 przebiegów na `next start`). Komunikat vitest: „Compared values have no visual difference”.

## Przyczyna
Strona `/r/{slug}` jest strumieniowana. Do HTML wchodzą wiersze React Flight (`<script>self.__next_f.push([1,"…"])</script>`) w kolejności, w jakiej rozwiązują się części renderu. Wiersze metadanych z `generateMetadata` (`f:null`, `15:[title, description]`) ścigają się z wierszem treści strony (`c:[…]`): w ok. jednym odczycie na dziesięć (5 z 60 na tej samej stronie) treść wyprzedza metadane. Zbiór 46 wierszy, ich identyfikatory i treść są takie same, HTML poza skryptami Flight też; różni się tylko kolejność. To zachowanie frameworka, nie błąd strony ani wyciek.

## Reguła
Test porównujący całe odpowiedzi stron Next.js normalizuje je przez `normalise` z `packages/app/tests/e2e/guest-compare.ts` (HTML bez skryptów Flight, potem wiersze Flight posortowane; nonce wycięty). Wiersze zostają w tekście, więc sprawdzanie przecieków i porównanie nadal widzą każdą zmianę treści. Nie porównuj surowego HTML dwóch odczytów i nie wycinaj Flight w całości. Przy niezgodności `firstDifference` wypisuje ścieżkę, offset i ±80 znaków.

## Jak sprawdzić
`npm run test -w @wine-match/app -- tests/unit/guest-compare.test.ts`; pętla `access-boundaries-guest.e2e.test.ts` (30 przebiegów) bez porażek; przed poprawką ok. 2 z 3 przebiegów padały.
