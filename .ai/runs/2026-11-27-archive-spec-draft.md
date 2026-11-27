---
started: 2026-11-27 17:30
ended: 2026-11-27 17:50
agent: Claude Code
spec: .ai/specs/2026-11-27-archive-dishes-wines.md
outcome: success
related: [.ai/specs/implemented/2026-11-16-catalog-field-editing.md]
---

# Szkic specyfikacji archiwizacji dań i win

## Zadanie
Właściciel poprosił o szkic specyfikacji brakującego „usuwania” dań i win (CRUD). Spec edycji katalogu wyłączył usuwanie (Q6), `DATA_MODEL.md` mówi, że nie jest zdecydowane.

## Przebieg
Szkic w statusie `draft` (miękkie usunięcie: `archived_at`, uprawnienie `catalog.archive`, cztery PR-y). Niezależny przegląd zlecony podagentowi (tylko odczyt); jego uwagi zostaną wpisane do specyfikacji przed otwarciem PR. Specyfikacji nie wolno implementować, dopóki właściciel nie ustawi `approved`.

## Weryfikacja
Dokumentacja; `check:context` do uruchomienia po wpisaniu uwag z przeglądu.

## Wynik
Szkic z uwagami przeglądu niezależnego gotowy do akceptacji właściciela; brak implementacji.

## Lekcje
brak
