# Szablon zgłoszenia błędu z sesji QA

Używany w kroku 6 `.ai/docs/qa-protocol.md`. Sam fakt, bez domysłów w tonie programisty; przypuszczalna przyczyna tylko w osobnym polu i oznaczona jako hipoteza. Bez sekretów, tokenów i danych spoza dema na zrzutach. Jedno zgłoszenie = jeden błąd.

```markdown
# <krótki tytuł: co jest źle, dla kogo>

## Środowisko
- Commit: <sha pełny lub 8 znaków> (`git rev-parse HEAD`)
- Gałąź / testowany obiekt: <PR #N | gałąź | develop (main)>
- Tryb: <DATA_SOURCE=postgres | memory>, cel bazy: <host:port/nazwa_bazy, bez danych logowania>
- Rola / konto: <gość | kelner | sommelier | GM | właściciel>, konto z seedu: <e-mail demo>
- Viewport: <390 | 1440 px>, język interfejsu: <PL | EN>
- Przeglądarka i metoda: <nazwa przeglądarki; kliknięte w prawdziwej przeglądarce | odczytany wyrenderowany HTML | curl>

## Kroki
1. <adres lub ekran wyjściowy, dane>
2. <działanie>
3. <działanie>

## Oczekiwane
<wynik> — wyrocznia: <AC specyfikacji | linia docs | reguła | scenariusz .ai/qa/...>

## Faktyczne
<co się stało, dosłowny tekst z ekranu, kod odpowiedzi>

## Dowód
- Zrzut ekranu (obejrzany; jedno zdanie, co na nim jest): <ścieżka>
- Konsola / sieć: <błąd lub „czysto”>
- Skrypt odtwarzający lub polecenie, jeśli jest: <...>

## Ważność
<blokujący | wysoki | średni | niski> — <jedno zdanie: kogo i jak dotyka; pieniądze, dane innej restauracji i uprawnienia to co najmniej wysoki>

## Czego to nie dowodzi
<np. „sprawdzone tylko w jednej przeglądarce”, „tylko rola sommeliera”, „tylko PL”, „nie sprawdzone na danych produkcyjnych”>

## Relacja do testowanego PR
<spowodowany przez ten PR | istniejał wcześniej (odtworzony na main, commit <sha>) | nie ustalono>

## Przypuszczalne miejsce i przyczyna (hipoteza, nie ustalenie)
<plik / funkcja, jedno zdanie; albo „brak”>

## Weryfikator niezależny
<odtworzony: tak/nie, kroki użyte bez rozumowania wykonawcy, uwagi>

## Co zostaje w repozytorium
<test e2e `it` i scenariusz .ai/qa/{AREA}-NNN do dodania wraz z naprawą>
```
