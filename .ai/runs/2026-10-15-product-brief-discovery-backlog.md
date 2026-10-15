---
started: 2026-10-15 13:50
ended: 2026-10-15 14:30
agent: Claude Code / claude-opus-5-5
spec: brak — dokumenty produktowe (brief, research, backlog), bez zmiany kodu
outcome: success
related: [.ai/runs/2026-10-15-discovery-pipeline-setup.md]
---

# Product brief, research i backlog badań (lekcja 4: om-discover + om-backlog)

## Zadanie
Przejść kroki lekcji 4 dla Wine Match: research w `.ai/specs/research/`, product brief (`om-discover`), backlog (`om-backlog`) i Issues w GitHubie. Właściciel poprosił o pracę samodzielną, bez dopytywania.

## Przebieg
- Oba skille są interaktywne; właściciel wybrał tryb bez rozmowy. Decyzje z zatwierdzonych specyfikacji (owner Filip) mają status `active`, nowe propozycje agenta (D08) i ceny (D07) — `proposal`.
- Tryb `existing` z kontrolami `own`: produkt istnieje, ale nie ma prawdziwych użytkowników ani danych.
- Research: `.ai/specs/research/README.md` (inwentarz źródeł i braków) i szablony zbierania materiału. Nie dodano żadnej notatki z wywiadu ani rekordu decyzji, bo nie było rozmowy.
- Brief: `.ai/specs/product-brief.md`, gotowy tylko do badań — Problems i Target group to `[ASSUMPTION]`.
- Sceptyk (pod-agent, świeży kontekst) znalazł 9 błędów agenta: przecenione „zatwierdzone przez Filipa” (faza 5 czeka na przegląd), pominięcie analityki i importu sprzedaży z zakresu D01 i z opisu stanu, `[PRODUCT]` wskazujące na dokument mockupów, niezbudowane tworzenie restauracji, „ceny w zł” bez źródła, Domain expert przypisany bez źródła, wymyślone terminy przeglądu, niepełna lista źródeł, nieotagowana linia. Wszystkie poprawione; dodane pytania Q05–Q08.
- Backlog: wariant badawczy (`om-backlog` HARD-GATE). Epik #3 i zadania #4–#9 z Collection plan, mapa w `.ai/specs/backlog.md`. Issues utworzone bezpośrednio przez `gh` z formatem ciała z `om-backlog` (Backlog source / Backlog id / Epic), etykiety: kategoria, priorytet, ryzyko.

## Weryfikacja
- Coverage przeliczone skryptem: 40 linii z tagami = document 24 + product 5 + assumed 11.
- `gh issue list`: 7 issues (#3–#9), checklist epiku wskazuje wszystkie zadania.
- Kod aplikacji bez zmian; CI na PR-ze.

## Wynik
Brief i backlog badań gotowe. Implementacja nowych funkcji czeka na dowody (D08 proposal) i odpowiedzi na Q05 (pomiar przed pilotażem) oraz Q08 (instancja i `PUBLIC_BASE_URL`).

## Lekcje
brak
