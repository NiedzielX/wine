---
status: draft
created: 2026-11-09
owner: właściciel (Filip)
related: [docs/RELEASING.md, .ai/runs/2026-11-09-lesson-22-release-management.md, .ai/lessons/2026-11-09-release-is-a-human-decision.md, .ai/specs/2026-10-15-production-deployment.md]
superseded_by:
author_model: claude-opus-5-5
reviewed_by: not recorded
---

# Automatyzacja zarządzania wydaniem: propozycje na później (lekcja 22)

**Draft. Nie implementować bez zmiany statusu na `approved` przez właściciela (`AGENTS.md` §3).** To lista propozycji z pytaniami, nie plan do wykonania w całości: właściciel wybiera pozycje (albo żadnej), a każda wybrana dostaje własną fazę z kryteriami.

## Problem
`docs/RELEASING.md` opisuje wydanie dla jednego właściciela: jedna gałąź `main`, PR wydania jako weryfikacja zbiorcza, ręcznie uruchamiany szkic `release.yml`, porządek w zgłoszeniach skillami `om-close-fixed-issues` i `om-auto-manage-issues`. Lekcja 22 pokazuje więcej narzędzi (Open Mercato: nocne wydania z `develop`, środowisko deweloperskie, podgląd per PR, kolejka scalania, automatyczny PR zastępczy z zasługą autora). Dziś ich nie potrzebujemy albo blokują je decyzje właściciela (hosting, domena), ale część stanie się potrzebna przy pierwszej restauracji pilotażowej albo drugiej osobie w projekcie.

## Cel i zakres
Zebrać propozycje, warunki ich sensowności i pytania do właściciela w jednym miejscu.
**Poza zakresem:** publikacja pakietów do npm (wszystkie są `private` i tak zostaje), wdrażanie przez agenta (DEPLOYMENT.md §10.5: agent nie wdraża i nie wycofuje produkcji), zmiana ochrony gałęzi (robi ją właściciel).

## Wymagania (propozycje, każda osobno do akceptacji)
- **R1 Środowisko nocne / deweloperskie.** Po każdym merge do `main` (albo raz na dobę) obraz z `main` wdrażany na instancję próbną z danymi demo (`DEPLOYMENT.md` §12–§13), z `smoke` po wdrożeniu i wynikiem w jednym miejscu. Warunek: hosting i domena (Q1, Q2), sekret wdrożeniowy w osobnym środowisku GitHub z ochroną.
- **R2 Podgląd per PR.** Każdy PR dostaje adres z wdrożoną aplikacją (`DATA_SOURCE=memory`, `ALLOW_DEMO_DATA=true`, `SHOWCASE_MODE` wyłączony), który agent QA i właściciel otwierają zamiast `npm run test-env:up`. Kandydaci: Coolify lub Dokploy na tej samej VM (bez zewnętrznego dostawcy), Railway, Vercel (ten ostatni nie pasuje do Compose i PostgreSQL). Warunek: Q1, Q2; PR z forka nie dostaje sekretów.
- **R3 Kolejka scalania.** GitHub merge queue albo `om-merge-buddy` w trybie raportu przed blokiem review; scala nadal właściciel. Sens dopiero przy wielu PR-ach dziennie (dziś limit 3 w review).
- **R4 Automatyczny PR zastępczy z zasługą.** Gdy PR (fork, Dependabot) trzeba poprawić, a nie da się dopisać do jego gałęzi: skill tworzy PR z zachowanymi commitami autora albo `Co-authored-by:`, `Supersedes #N`, i dopisuje zasługę w `CHANGELOG.md` (reguła „Supersede Credit” z `om-auto-update-changelog`).
- **R5 Synchronizacja zgłoszeń przy wydaniu.** Uruchamianie `om-close-fixed-issues` i `om-auto-manage-issues --relabel-only` jako jednego kroku przygotowania wydania (lokalne rozszerzenia w `.ai/skills/`, np. domyślne `--since` z ostatniego tagu `v*`, bo `last-release` szuka nagłówka w formacie, którego nasz `CHANGELOG.md` nie używa).
- **R6 Notatki zbierane automatycznie.** `om-auto-update-changelog` dopasowany do formatu Keep a Changelog (lokalne rozszerzenie) zamiast ręcznych wpisów w każdym PR-ze; ręczna redakcja przed wydaniem zostaje.
- **R7 Skill aktualizacji per wydanie.** Jak w Open Mercato „upgrade skill” migrujący kod użytkownika: u nas odpowiednikiem jest skrypt dla operatora (np. sprawdzenie `.env` względem `UPGRADE_NOTES.md` danej wersji). Sens dopiero, gdy instalacji jest więcej niż jedna.
- **R8 Kamienie milowe jako plan wydań.** Milestone GitHub na wersję; skill porządkujący przypisuje do niego zgłoszenia ze zgody właściciela.
- **R9 Wydanie z gałęzi `release/X.Y`.** Rozszerzenie `release.yml` o gałęzie `release/*` (dziś tylko `main`, hotfix ze starszego tagu robi właściciel ręcznie, RELEASING.md §9).

## Kryteria akceptacji
Ustalane dla każdej wybranej pozycji osobno, przed zmianą statusu. Wspólne minimum dla każdej: brak sekretu w repozytorium i w logach (`npm run secrets:scan`), akcje przypięte pełnym SHA, minimalne uprawnienia per job, test skryptów w `packages/testkit/tests`, dwa review dla zmian w `.github/` (`risk-high`).

## Projekt rozwiązania
Do opracowania po wyborze pozycji. Punkty wyjścia: `docs/RELEASING.md`, `.github/workflows/release.yml`, `.github/workflows/ci.yml` (job `image`), `docs/DEPLOYMENT.md` §12–§15, skille `.claude/skills/om-close-fixed-issues`, `om-auto-manage-issues`, `om-auto-update-changelog`, `om-merge-buddy`.

## Ryzyka i otwarte pytania
- **Q1 Hosting:** dostawca VM (DEPLOYMENT.md §15), czy podgląd per PR i środowisko nocne mogą stać na tej samej maszynie co produkcja (zalecane: nie).
- **Q2 Domena:** adres produkcji, demo i podglądów (np. `pr-123.preview.<domena>`); `PUBLIC_BASE_URL` jest nieodwracalne po wydruku QR.
- **Q3 Wersja 1.0:** co musi być prawdą (pierwsza restauracja w produkcji? stabilne API `v1`? E12–E15?).
- **Q4 Licencja:** nie wybrana; wpływa na publiczne repozytorium, podgląd per PR z forków i treść notatek.
- **Q5 Rytm wydań:** „gdy gotowe” czy stały (np. co 2 tygodnie)?
- **Q6 Rejestr obrazów:** budowa na hoście z tagu (dziś) czy GHCR z podpisem; wpływa na wycofanie (stary obraz musi istnieć).
- **Q7 Kanał ogłoszeń** dla restauracji (e-mail, panel, nic).
- **Q8** Czy `image` i CodeQL mają zostać wymaganymi checkami przed pierwszym wydaniem?
- Ryzyko: każdy automat wdrażający dostaje sekret; wymaga osobnego środowiska GitHub z akceptacją właściciela i modelu zagrożeń (`docs/security/threat-model.md`).

## Changelog
- 2026-11-09 — Autor/recenzent: claude-opus-5-5 / not recorded (draft bez przeglądu; log `.ai/runs/2026-11-09-lesson-22-release-management.md`).

## Realizacja
(brak: draft)
