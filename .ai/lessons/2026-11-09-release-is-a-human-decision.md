---
date: 2026-11-09
updated:
area: process
status: active
source: .ai/runs/2026-11-09-lesson-22-release-management.md
promoted:
---

# Wydanie jest decyzją człowieka; weryfikuj zbudowany artefakt, a poprawki stabilizujące kwestionuj

## Kontekst
Lekcja 22 kursu (zarządzanie wydaniem w Open Mercato: 130+ kontrybutorów, 160 otwartych PR-ów, gałęzie `develop` i `main`, zbiorczy PR „release X.Y.Z”, publikacja pakietów i testy integracyjne na opublikowanych paczkach). Przeniesienie na projekt jednego właściciela: `docs/RELEASING.md`, `UPGRADE_NOTES.md`, §9 w `BACKWARD_COMPATIBILITY.md`, skrypty `release:version` / `release:notes`, szkic `.github/workflows/release.yml`.

## Przyczyna
Trzy rzeczy z lekcji nie wynikają z kodu, a łatwo je zgubić przy automatyzacji:
1. Automat, który „sam wydaje”, przenosi decyzję o zakresie i ryzyku z człowieka na skrypt. U nas merge PR-a już jest decyzją właściciela (`review-protocol.md` §1); wydanie i ogłoszenie są kolejnymi.
2. Zielone testy monorepo nie dowodzą, że działa to, co dostaje odbiorca. Open Mercato testuje opublikowane paczki; naszym odpowiednikiem jest job CI `image` (obraz `runtime` i `migrator`, odmowy startu, migracje, `smoke --production`), który nie jest jeszcze wymaganym checkiem.
3. Pętla „agent naprawia, aż CI będzie zielone” chętnie przechodzi przez obejście (przykład z lekcji: wyczyszczony adres bazy w `.env.example`). Zielone CI po obejściu to fałszywy dowód.

Przy okazji: `@wine-match/testkit` jest w `packages/app` i `packages/db` przypięty dokładnie (`0.2.0`). Po podniesieniu wersji pakietów npm nie powiązałby go z workspace'em i szukałby tej nazwy w rejestrze (ryzyko *dependency confusion*); `release:version` to wykrywa i odmawia `--set`. Naprawione 2026-11-09: zakresy `"*"`, `--check` odrzuca każdy inny zakres wewnętrzny.

## Reguła
- Wydanie (zakres, publikacja, wdrożenie, ogłoszenie) decyduje właściciel. Agent i workflow tylko przygotowują: PR wydania, szkic GitHub Release (`publish: false` domyślnie), notatki. Workflow wydania działa tylko z `main`, tylko ręcznie, nie publikuje pakietów i nie wdraża.
- Weryfikacja wydania obejmuje zbudowany artefakt (`image`), nie tylko testy źródeł; `release.yml` wymaga zielonego `image` na otagowanym commicie, nawet gdy ochrona gałęzi jeszcze go nie wymaga.
- Poprawkę stabilizującą, która wyłącza test, czyści wartość, dodaje wyjątek do allowlisty albo luzuje próg, przyjmujesz dopiero po odpowiedzi „dlaczego”; bez przyczyny to bloker.
- Wersję zmieniaj skryptem (`npm run release:version -- --set`), który rusza tylko pola `version` i odmawia, gdy dokładny zakres wewnętrzny przestałby pasować; zakresy zależności zmienia człowiek w osobnym PR-ze.

## Jak sprawdzić
`npm run release:version -- --check`, `npm run release:notes -- check`; testy `packages/testkit/tests/release-version.test.ts` i `release-notes.test.ts`; lista kontrolna `docs/RELEASING.md` §6.
