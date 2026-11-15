---
started: 2026-11-15 13:18
ended: 2026-11-15 14:05
agent: Claude Code
spec: brak — dokumentacja
outcome: partial
related: [.ai/lessons/2026-11-09-release-is-a-human-decision.md, docs/RELEASING.md]
---

# SECURITY.md, krótki README i przygotowanie wydania 0.1.0 (dwie gałęzie)

## Zadanie
Dwa niezależne zestawy zmian dokumentacyjnych, bez zmian w kodzie produktu: (1) gałąź `docs/readme-and-security`: `SECURITY.md` (SEC-08), krótki `README.md` i szczegóły w `docs/DEVELOPMENT.md`; (2) gałąź `chore/release-0.1.0-prep`: wersja i promocja notatek według `docs/RELEASING.md` §5. Bez push, PR, tagu, publikacji. Jeden log opisuje obie gałęzie.

## Przebieg
- Worktree z `origin/main` (dc5068a): `/home/user/wine-docs-a` i `/home/user/wine-release-prep`. `npx -y npm@11.20.0 install --engine-strict=false` w obu: ok.
- README: treść sprzed zmiany przeniesiona do `docs/DEVELOPMENT.md` bez zmian poza ścieżkami względnych linków (26 linii, bo plik leży w `docs/`) i nagłówkiem. Nowy README: 55 linii, bez słowa „AI”. Sekcja „Niezweryfikowane w tym przeglądzie README” w DEVELOPMENT.md jest przeniesiona dosłownie i częściowo nieaktualna (mówi, że `docs/DEPLOYMENT.md` nie istnieje): do decyzji właściciela, czy ją usunąć.
- Odwołania po nazwie sekcji (grep po `README.md#` nic nie znalazł, kotwic nie było) poprawione na `docs/DEVELOPMENT.md`: `CONTRIBUTING.md`, `docs/DEPLOYMENT.md` (2), `docs/DATA_MODEL.md`, `docs/RECOMMENDATION_ENGINE.md`, `BACKWARD_COMPATIBILITY.md` (reguła zmiennych środowiska). `CONTRIBUTING.md`: link do `SECURITY.md` zamiast „osobnej polityki jeszcze nie ma”. `AGENTS.md` bez zmian (nadal wskazuje `README.md`, który ma Szybki start i odnośnik do DEVELOPMENT.md).
- `SECURITY.md`: PL i EN, bez adresu e-mail; włączenie private vulnerability reporting jest uwagą dla właściciela poza plikiem.

## Weryfikacja
- Szybki start: `cp .env.example .env`, `npm run dev -- -p 3457`: `/r/halka` 200, `/admin/login` 200 (`.env` usunięty po próbie; `next dev` zmienia `packages/app/AGENTS.md`, zmiana cofnięta).
- Linki w README.md, SECURITY.md, CONTRIBUTING.md, docs/DEVELOPMENT.md: wszystkie cele istnieją.
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (istniejące: rozmiary specyfikacji).
- `npm run lint`: czysto. `npm run secrets:scan`: 21 trafień, wszystkie na allowliście.
- `npm run audit:process`: SEC-08 PASS, PROD-01 PASS; ogółem PASS 47, FAIL 5, PARTIAL 1, MANUAL 10 (pozostałe FAIL: TEST-04/05/06, REL-04, PROD-02, niezwiązane).

## Gałąź wydania `chore/release-0.1.0-prep` (worktree `/home/user/wine-release-prep`): ZATRZYMANA, bez commitów
Polecenia (bez `--write`, z `/home/user/wine-release-prep`, wszystkie wersje pakietów 0.2.0):
- `npm run release:version -- --set 0.1.0`: plan 15 pól `0.2.0 -> 0.1.0` (obniżenie wersji; skrypt na to pozwala).
- `npm run release:notes -- check`: OK.
- `npm run release:notes -- promote 0.1.0`: **FAILED: version 0.1.0 is not newer than the latest released 0.2.0** (CHANGELOG.md ma historyczną sekcję `## [0.2.0]` bez daty).
- `npm run release:notes -- promote 0.3.0` (tylko próba): przeniosłoby `[Unreleased]` pod `## [0.3.0] - 2026-11-15` w obu plikach.
- Testy skryptów wydania (`npm test -w @wine-match/testkit -- release`): 2 pliki, 42 testy, zielone. `npm run check:context`: 0 błędów, 9 ostrzeżeń.
Powód zatrzymania (AGENTS.md §3 reguła 4): 0.1.0 jest odrzucone przez skrypt i sprzeczne z `docs/RELEASING.md` §3 i §5 pkt 2: `UPGRADE_NOTES.md [Unreleased]` ma wpis łamiący (#120), więc wersja ma być co najmniej `0.MINOR+1.0` = 0.3.0. Nie wymuszałem (np. edycją historycznej sekcji 0.2.0), bo to zmiana decyzji o numerze wersji.

## Wynik
Gałąź `docs/readme-and-security` gotowa lokalnie. Wydanie: czeka na decyzję o numerze wersji (rekomendacja 0.3.0); wtedy `release:version -- --set 0.3.0 --write`, `release:notes -- promote 0.3.0 --write`, poprawka zdania wstępnego CHANGELOG.md (§5 pkt 5).

## Lekcje
brak
