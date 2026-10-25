---
date: 2026-10-25
updated:
area: process
status: active
source: .ai/runs/2026-10-25-pos-item-name-privacy.md
promoted:
---

# Przy pytaniu o decyzję wybieraj rekomendowaną opcję i zapisz ją; pytaj tylko, gdy nie ma rekomendacji

## Kontekst
Właściciel produktu poprosił, żeby agent nie wstrzymywał pracy na jego odpowiedzi. W sesji o #89 agent zadał pytanie z trzema opcjami, chociaż jedna była oznaczona jako rekomendowana, i czekał na wybór. Pytanie zatrzymało pracę, a rekomendacja była znana.

## Przyczyna
Brak zapisanej reguły, która pozwalałaby podjąć decyzję samodzielnie.

## Reguła
- Gdy pytanie ma opcję oznaczoną jako rekomendowana, wykonaj ją bez czekania, a w odpowiedzi napisz, którą wybrałeś i dlaczego.
- Nie pytaj, gdy decyzja jest odwracalna i mieści się w zakresie zadania (zgodnie z AGENTS.md §3 i §6).
- Pytaj tylko, gdy użytkownik wyraźnie zaznaczy, że chce wybrać sam, albo gdy decyzja jest nieodwracalna lub wychodzi na zewnątrz (np. publikacja, wysłanie danych, zamknięcie issue bez zgody) i nie ma rekomendacji.
- Gdy użytkownik napisze, że ma być inaczej, zastosuj jego wybór i zapisz go tutaj jako wyjątek.
- **Wyjątek (2026-10-25): merge PR-ów tylko na wyraźne polecenie użytkownika** („merguj #N” albo „merguj wszystkie”). Zielone CI i etykiety nie są poleceniem. Wcześniejsza zgoda na „wszystkie fazy” obejmuje przygotowanie PR-ów, nie ich merge. Zmerguj też tylko wtedy, gdy bramka QA z `SDLC.md` jest spełniona albo użytkownik wyraźnie zrzeka się jej na tym PR.

## Jak sprawdzić
W kolejnym pytaniu z rekomendacją agent wykonuje opcję rekomendowaną i podaje ją w odpowiedzi, bez oczekiwania na odpowiedź.
