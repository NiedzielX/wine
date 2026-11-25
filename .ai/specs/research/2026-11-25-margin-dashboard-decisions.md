# Pulpit marży: alternatywy i skutki decyzji D1–D17

Załącznik do `.ai/specs/2026-11-25-margin-dashboard.md`. Specyfikacja trzyma pytanie i rekomendację; tu są alternatywy i ich skutki, żeby człowiek mógł rozstrzygnąć bez czytania całości. Status: propozycje agenta (`[ASSUMPTION]`), do decyzji właściciela.

| # | Alternatywa | Skutek |
|---|---|---|
| D1 | Kolumna w `wine` i pole `Wine.cost` | `buildSnapshot`, `PublishedView`, API win i mappery gościa czytają `Wine`; koszt wyciekłby przez każdy z nich. Osobny port daje barierę strukturalną |
| D2 | Ustawienie stawki VAT per lokal | Potrzebne dla lokalu zwolnionego z VAT (koszt brutto, stawka 0) lub z inną stawką; kolejna kolumna bez danych z pilota. Bez potwierdzenia założenia marża jest przeszacowana o ok. 23% ceny. Ceny dla konsumenta w Polsce podaje się brutto, więc założenie ma oparcie (to nie porada prawna); stawkę potwierdza księgowość pilota |
| D3 | Współczynnik strat per lokal (rozlew, korki, niedopite butelki) | Dokładniejsza marża kieliszka, ale pole bez danych |
| D4 | Owner włącza sommelierowi `cost.manage` (wpis kosztów bez oglądania marży) | Wine Director zwykle zna faktury, a owner i GM nie muszą wpisywać 60 kosztów sami: lepsza adopcja. Koszt: sommelier widzi koszt przy wpisie. Niezależnie od wyboru sommelier wpływa na liczby pulpitu bez ich oglądania (`catalog.edit` zmienia ceny, `import.manage` zastępuje rachunki), jak w zastrzeżeniu R10 raportu wyników. Wariant `margin.view` dla sommeliera: osobna decyzja po pilocie |
| D5 | (b) Zapis przy kodzie, czy porcja była jawna (patrz D15) lub (c) dopasowanie pozycji POS do win | Dopasowanie pozycji zmienia E03 Q10 i Q18 (tekst wolny, dane osobowe, kruchość mapowania); osobna specyfikacja, jeśli pilot zażąda |
| D6 | Próg wysokiej marży ustawiany przez lokal | Więcej pracy dla właściciela, rozbieżne definicje między lokalami |
| D7 | Test okresami „z wyborami i bez” (P12/4); flaga `pick` w `recommendation_code` | Okresy: konfundowane sezonem i kartą. Flaga w kodzie: kod powstaje po wyborze wina, więc konwersja zamówione / wydane nie mierzy wpływu etykiety; miarę wpływu etykiety dają zdarzenia użycia (niosą `pick`). Odłożone |
| D8 | Podbicie wyniku według marży | F2 z picks: PR-B, decyzja właściciela, opinia prawna; poza zakresem |
| D9 | Kafelek marży na A1 | A1 widzi sommelier: przeciek albo układ warunkowy |
| D10 | Okna 28 dni z raportu wyników | Tam jest „przed i po”; tu opis okresu |
| D11 | Wspólna kategoria sponsorowanych i wyborów | Mieszałaby oznaczenia i zaniżała koszt |
| D12 | `effective_from` per wpis kosztu | Dokładniejsze po zmianie ceny, kosztuje model i UI; wrócić, jeśli ceny zmieniają się często |
| D13 | Brak zdania w `AGENTS.md` | Reguła sprawdzana testami AC, ale niewidoczna dla każdego agenta; zmiana `AGENTS.md` idzie osobnym PR-em właściciela (CODEOWNERS) |
| D14 | Przykładowe koszty w demo | Lepsza prezentacja, ale ktoś weźmie je za dane lokalu; konta demo mają publiczne hasło, więc koszt wpisany przez jednego zobaczą inni |
| D15 | (a) Zapis przy kodzie, czy porcja była jawna; polecenia z porcją domyślną osobno jako „porcja nieznana”, z marżą butelki i kieliszka obok siebie; (b) uznać kod z POS za dowód wina (odrzucone) | (a) zmienia model `recommendation_code` (osobny PR i zgoda), daje dokładniejszą metrykę. (b) fałszywe: POS łączy kod z rachunkiem, nie z winem (E09 Q12) |
| D16 | Zostawić obecne mapowanie nagłówków | Nagłówek „Cena zakupu” w imporcie win trafia przez regułę prefiksu `cena ` do ceny butelki, a w imporcie menu `cost`/`koszt` to z definicji cena; ceny są danymi bieżącymi, więc koszt stałby się ceną widoczną dla gości bez publikacji |
| D17 | Wyjątek od N04 (pricing intelligence): pulpit jako narzędzie cenowe | Wymaga zmiany briefu (osobny PR). Rekomendacja: podpowiedzi nie dotyczą cen („sprawdź kartę”) |
