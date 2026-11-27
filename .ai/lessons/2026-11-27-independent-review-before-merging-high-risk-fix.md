---
date: 2026-11-27
updated:
area: process
status: active
source: .ai/runs/2026-11-27-orchestration-session.md
promoted:
---

# Niezależny przegląd poprawki `risk-high` robi się przed scaleniem; heurystyki nazw kolumn testuj w obie strony

## Kontekst
Poprawka #200 (kolumna kosztu zakupu w imporcie nie może stać się ceną) była `risk-high` i weszła bez niezależnego przeglądu. Przegląd po fakcie znalazł dziurę: plik bez rozpoznanego nagłówka nadal wpisywał koszt do ceny. Drugi przegląd poprawki (#202) znalazł kolejne: nagłówek w dwóch wierszach oraz nową regresję, czyli fałszywe odrzucenia poprawnych plików i cytowanie komórek w komunikacie.

## Przyczyna
Poprawka dotyczy danych widocznych dla gości (cena na karcie), a autor testuje to, co sam przewidział. Heurystyka rozpoznawania kolumn po nazwie myli się w obu kierunkach: przeoczenie i fałszywe trafienie.

## Reguła
- Poprawkę błędu o wpływie na dane widoczne dla gości przegląda niezależna sesja PRZED scaleniem (`.ai/docs/fix-verification.md` §4), nie po fakcie.
- Przy heurystyce nazw kolumn testuj: plik bez nagłówka, nagłówek w kilku wierszach, fałszywe trafienia w obie strony (poprawna kolumna odrzucona, błędna przyjęta).
- Komunikat błędu nie cytuje treści komórek z pliku użytkownika.

## Jak sprawdzić
Testy importu zawierają przypadki z reguły; w PR jest komentarz przeglądu z innej sesji sprzed scalenia.
