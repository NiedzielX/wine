---
date: 2026-11-06
updated:
area: tooling
status: active
source: .ai/runs/2026-11-06-e12-f2-invitations.md
promoted:
---

# Rodzaj wiersza zapisuj jawnie: nie wnioskuj „konto platformy” z braku członkostwa

## Kontekst
Pierwsza wersja zaproszeń uznawała zapraszającego bez wiersza członkostwa za konto platformy (`inviteOwner`) i przepuszczała jego link bez sprawdzeń. Przegląd: zwykły zapraszający, któremu wiersz członkostwa zniknął, zostawiał żywy link na każdą rolę.

## Reguła
Wyjątek od reguły dostępu (tu: konto platformy) oznacz kolumną ustawianą tylko przez jedyną ścieżkę, która go tworzy (`auth_token.platform`), a brak powiązanego wiersza traktuj jak odmowę. Wyjątek oceniaj przy użyciu tą samą regułą co przy tworzeniu, bo stan świata zmienia się między jednym a drugim (po powstaniu właściciela każde zaproszenie platformy na właściciela umiera).

## Jak sprawdzić
`packages/core/tests/invitations.test.ts` (blok „platform flag”), `packages/db/tests/repositories.integration.test.ts` („review fixes”).
