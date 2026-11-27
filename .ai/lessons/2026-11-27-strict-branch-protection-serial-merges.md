---
date: 2026-11-27
updated:
area: process
status: active
source: .ai/runs/2026-11-27-orchestration-session.md
promoted:
---

# Ochrona `main` ma `strict`: scalanie jest szeregowe, a wyniki CI czytaj dopiero po rejestracji nowego commitu

## Kontekst
Przy kolejce wielu PR-ów każde scalenie robiło pozostałe „behind”, a CI trwa ok. 12-15 minut. Skrypt scalający, który odczytał wyniki zaraz po pushu, widział stare wyniki i zgłosił fałszywe „RED”. Proces w tle zginął przy restarcie procesu sesji.

## Przyczyna
Ochrona gałęzi wymaga aktualnej gałęzi (`strict`). Po pushu stare checki przez chwilę zostają przypisane poprzedniemu commitowi, zanim CI zarejestruje się dla nowego.

## Reguła
- Planuj scalanie szeregowo i w czasie: jeden PR na 12-15 minut, następny dopiero po aktualizacji do `main`.
- Skrypt czyta wyniki dla SHA nowego commitu i czeka, aż checki zarejestrują się dla niego; stare wyniki nie są dowodem.
- Proces w tle nie przeżywa restartu sesji: po restarcie sprawdź stan PR-ów (`gh pr list`, `gh pr checks`), nie zakładaj, że skrypt dokończył.

## Jak sprawdzić
`gh pr checks <n>` pokazuje checki z czasem startu późniejszym niż push.
