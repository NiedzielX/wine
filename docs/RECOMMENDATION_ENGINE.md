# Wine Matching Engine v1 (`wm-rules-1.1.0`)

Silnik działa **bez zewnętrznego API LLM**: czyste funkcje TypeScript, deterministyczne, bez sieci i losowości. Ten sam kod działa w przeglądarce (mockup, podgląd na żywo w panelu) i na serwerze (Node). Implementacja i testy:

| Plik | Zawartość |
|---|---|
| `packages/core/src/engine/scoring.ts` | `pairingScore(dish, wine)` — reguły i wyjaśnienie |
| `packages/core/src/engine/recommend.ts` | `recommendForDish(...)` — filtry, warstwa sommeliera, cena, Best value |
| `packages/core/src/engine/table.ts` | `recommendForTable(...)` — butelka dla stolika |
| `packages/core/src/engine/suggest.ts` | `generateSuggestions(...)` — propozycje silnika do kolejki review |
| `packages/core/src/engine/drafts.ts` | szkic profili przy imporcie (reguły słów kluczowych), parser CSV |
| `packages/core/tests/engine.test.ts` | 23 testy jednostkowe silnika (`npm test`) |
| `packages/core/scripts/engine-matrix.ts` | przegląd kalibracji (`npm run engine:matrix`) |

Silnik wywołują serwisy z `packages/core/src/services` (np. `RecommendationService`), a te są używane przez strony i API w `packages/app` przez kontener DI — patrz `README.md`, sekcja Architektura.

## 1. Architektura w skrócie

```
               ┌──────────────── import (raz) ─────────────────┐
PDF/XLSX/CSV → │ parser → draft profilu (reguły | lokalny LLM) │ → personel potwierdza profil
               └───────────────────────────────────────────────┘
                                   │
     DishProfile + WineProfile ────┤
                                   ▼
                  pairing_score(dish, wine)  ← reguły sommelierskie, 0–99 + czynniki
                                   │
             Pairing (suggested) ──┤── decyzje sommeliera (approved / modified / rejected, rola, kolejność)
                                   ▼
    recommendForDish / recommendForTable  ← preferencje gościa (filtry twarde i miękkie)
                                   │
                         cache Recommendation (per wersja publikacji)
                                   ▼
                              aplikacja gościa
```

Koszt zapytania gościa: kilkanaście porównań liczb na wino. Dla karty 200 win i 30 dań cała macierz 6 000 par liczy się w kilka milisekund, więc warianty domyślne są przeliczane przy każdej publikacji, a warianty z filtrami — na żądanie i cache’owane.

## 2. Cechy dania (DishProfile)

| Cecha | Skala | Znaczenie |
|---|---|---|
| intensity | 0–5 | ogólna siła smaku dania (waga) |
| fat | 0–5 | tłuszcz (masło, marmurkowanie, skóra) |
| salt | 0–5 | słoność (peklowanie, sery dojrzewające, kawior) |
| sweetness | 0–5 | słodycz (sosy owocowe, glazury, desery) |
| acidity | 0–5 | kwasowość (pikle, cytrus, rokitnik) |
| spice | 0–5 | ostrość (chili, gochujang) |
| umami | 0–5 | umami (grzyby, sery dojrzewające, miso, dry-aged) |
| smoke | 0–5 | dym, przypieczenie, grill |
| creaminess | 0–5 | kremowa tekstura (risotto, beurre blanc, burrata) |
| protein | enum | `beef`, `game`, `poultry`, `pork`, `fish`, `shellfish`, `vegetable`, `mushroom`, `dairy`, `dessert` |
| cooking | enum | `raw`, `cured`, `poached`, `seared`, `roasted`, `grilled`, `braised`, `fried`, `baked`, `none` |
| source | enum | `draft` / `confirmed` |

## 3. Cechy wina (WineProfile)

| Cecha | Skala | Znaczenie |
|---|---|---|
| sweetness | 0–5 | 0 wytrawne, 2 półwytrawne (Kabinett), 5 Aszú |
| acidity | 0–5 | kwasowość |
| tannin | 0–5 | taniny |
| body | 0–5 | ciało |
| alcohol | % | zawartość alkoholu |
| fruitiness | 0–5 | owocowość |
| oak | 0–5 | beczka |
| aromatic | 0–5 | intensywność aromatu |
| freshness | 0–5 | świeżość |
| style | enum | `sparkling`, `white`, `rose`, `orange`, `red`, `sweet` |
| grapes | lista | pierwszy = dominujący (do reguł afinicji) |
| adventurous | bool | dla preferencji „Classic / Adventurous” |
| region | tekst | przechowywany; w v1 nie wpływa na wynik (patrz roadmapa) |

## 4. Compatibility score

```
pairing_score(dish, wine) = clamp(0, MAX_SCORE, round(BASE_SCORE + Σ delta_i))   // MAX_SCORE = 99, BASE_SCORE = 72
```

Bazą jest `BASE_SCORE` = 72 („neutralne, akceptowalne połączenie”), górą skali `MAX_SCORE` = 99. Każda reguła dodaje lub odejmuje punkty i jest zapisywana jako czynnik `{rule, delta, why?}`. Wynik jest więc w pełni wyjaśnialny: sommelier widzi, dlaczego coś zostało zaproponowane, a testy sprawdzają konkretne reguły.

### Reguły (`d` = danie, `w` = wino)

| # | Reguła (`rule`) | Warunek | Delta |
|---|---|---|---|
| 1 | `weight.match` | \|w.body − d.intensity\| ≤ 1 | +4 |
| 1 | `weight.gap` | różnica > 1 | −5 × (różnica − 1) |
| 2 | `acid.under` | w.acidity < d.acidity | −6 × różnica |
| 2 | `acid.cuts_fat` | w.acidity ≥ 4, ≥ d.acidity + 1, d.fat ≥ 3 | +5 |
| 3 | `sweet.under` | d.sweetness − w.sweetness − tolerancja > 0 (tolerancja: 1 deser, 2 danie wytrawne) | −7 × nadwyżka |
| 3 | `sweet.savoury_clash` | wino słodkie (≥ 4) do dania niedeserowego, poza słonym serem | −25 (d.sweetness ≤ 1) / −14 |
| 3 | `sweet.dry_with_dessert` | deser i w.sweetness ≤ 1 | −10 |
| 4 | `tannin.fish` | ryba / owoce morza i w.tannin ≥ 2 | −8 × (tannin − 1) |
| 4 | `tannin.red_meat` | wołowina / dziczyzna i w.tannin ≥ 3 | +6 |
| 4 | `tannin.fat` | w.tannin ≥ 3 i d.fat ≥ 4 | +3 |
| 4 | `tannin.overpowers` | d.intensity ≤ 2 i w.tannin ≥ 4 | −8 |
| 4 | `tannin.dessert` | deser i w.tannin ≥ 2 | −6 |
| 5 | `spice.alcohol` | d.spice ≥ 2 i alkohol > 13,5% | −4 × (spice − 1) |
| 5 | `spice.tannin` | d.spice ≥ 2 i w.tannin ≥ 3 | −3 × (spice − 1) |
| 5 | `spice.offdry` | d.spice ≥ 2, w.sweetness 1–2, aromatic ≥ 4 | +7 |
| 6 | `umami.tannin` | d.umami ≥ 4 i w.tannin ≥ 4 | −5 |
| 6 | `umami.fruit` | d.umami ≥ 4, fruitiness ≥ 3, tannin ≤ 3 | +2 |
| 7 | `smoke.oak` | d.smoke ≥ 3 i w.oak ≥ 2 | +4 |
| 7 | `smoke.delicate` | d.smoke ≥ 3 i w.body ≤ 2 | −4 |
| 8 | `salt.bubbles` | d.salt ≥ 4 i musujące | +5 |
| 8 | `salt.acid` | d.salt ≥ 4 i w.acidity ≥ 4 | +2 |
| 8 | `salt.tannin` | d.salt ≥ 4 i w.tannin ≥ 4 | −3 |
| 9 | `cream.texture` | d.creaminess ≥ 3, białe / orange z body ≥ 3 | +4 |
| 9 | `cream.bubbles` | d.creaminess ≥ 3 i musujące | +3 |
| 9 | `cream.tannin` | d.creaminess ≥ 3 i w.tannin ≥ 3 | −3 |
| 10 | `raw.alcohol` | surowe / peklowane i alkohol ≥ 14% | −3 |
| 10b | `style.light_with_red_meat` | wołowina / dziczyzna, intensity 5, wino białe / różowe / musujące | −6 |
| 11 | `aroma.quiet` | w.aromatic < d.intensity − 2 | −4 |
| 12 | `affinity.<protein>` | klasyczne połączenia sommelierskie (tabela niżej) | +3 … +9 |

### Afinicje (warstwa wiedzy sommelierskiej)

| Danie | Wino | Delta |
|---|---|---|
| beef | Cabernet Sauvignon / Syrah / Gamay (surowa wołowina) / musujące (surowa) | +7 / +4 / +8 / +4 |
| game | Syrah / Nebbiolo | +8 / +5 |
| poultry | Pinot Noir / Gamay | +8 / +5 |
| pork | Riesling / różowe | +7 / +3 |
| fish | białe lub musujące / Chardonnay z body ≥ 3 przy kremowym sosie / Grüner Veltliner z rybą peklowaną | +4 / +5 / +6 |
| shellfish | białe lub musujące / Chardonnay z body ≥ 3 | +4 / +4 |
| mushroom | Pinot Noir / Chardonnay z beczką | +7 / +6 |
| vegetable | orange / białe z body ≥ 3 | +7 / +3 |
| dairy | Chardonnay / musujące / słodkie przy słonym serze | +4 / +3 / +6 |
| dessert | wino słodkie co najmniej tak słodkie jak deser | +9 |

Tabela jest danymi, nie kodem warunkowym — w produkcji trzymana w `EngineVersion.config` i edytowalna przez zespół Wine Match (nie przez restauracje), z wersjonowaniem.

### Wyjaśnienie „Why it works”

Dwa najsilniejsze czynniki dodatnie z polem `why` łączone w zdanie, np. *„Pinot Noir’s red fruit mirrors the cherry and roasted skin, and fresh acidity cuts through the richness.”* Remis rozstrzyga nazwa reguły (determinizm). Brak czynników dodatnich → *„A balanced, food-friendly red wine for this dish.”* Komentarz sommeliera zawsze zastępuje tekst wygenerowany.

**Języki (spec `2026-10-15-polish-language`).** Każdy tekst `why` jest parą `{ en, pl }` zapisaną przy samej regule (w `add()` i w `AFFINITIES`), więc reguła bez polskiego tekstu nie przejdzie kompilacji. Czynnik ma `why` (EN, bez zmian w API) i `whyPl`. `explain(factors, wine, locale = 'en')` składa zdanie w danym języku: po polsku dwa czynniki łączy „, a ”, a zdanie awaryjne brzmi *„Wszechstronne, zrównoważone wino czerwone, które dobrze pasuje do tego dania.”* (`styleWord(wine, 'pl')`). Tak samo `locale` przyjmują `recommendForDish`, `recommendForTable` (uzasadnienia stolika: nazwy dań bez odmiany, w cudzysłowie) i komunikat budżetu. Wynik, czynniki i kolejność nie zależą od języka. Publiczne API (`/api/v1`) nie przekazuje `locale` — jego `why` i `notice` są zawsze po angielsku. Komentarz sommeliera wyświetlany jest tak, jak go wpisano.

### Przykład: Duck breast × Savigny-lès-Beaune

| Czynnik | Delta |
|---|---|
| baza | 72 |
| `weight.gap` (body 2 vs intensity 4) | −5 |
| `acid.cuts_fat` (acidity 4, fat 4) | +5 |
| `affinity.poultry` (Pinot Noir) | +8 |
| **wynik** | **80** |

## 5. Rekomendacje sommeliera

Kolejność rankingu (`recommendForDish`):

1. **Hard filters:** wino aktywne; serwowanie (kieliszek wymaga `glassPrice`); styl; budżet; pary `rejected` są wykluczone zawsze.
2. **Tier:**
   - tier 0 — para zatwierdzona (`approved` / `modified`) z rolą `primary`,
   - tier 1 — pozostałe pary zatwierdzone, w kolejności `rank` ustawionej przez sommeliera,
   - tier 2 — propozycje silnika (pokazywane tylko, gdy wynik ≥ `MIN_MODEL_SCORE` = 62 i gdy restauracja ma włączone „Fill empty places with engine picks”).
3. W obrębie tieru: `rankScore` malejąco, potem cena rosnąco, potem `wine.id`.
4. Limit: `DEFAULT_LIMIT` = 4 pozycje.

`rankScore = matchScore + preferencje + (tier < 2 ? SOMMELIER_BOOST : 0)`, `SOMMELIER_BOOST` = 6. **Wyświetlany Match Score to zawsze `matchScore` silnika** — zatwierdzenie zmienia kolejność, nie liczbę. Para sommeliera z wynikiem 58% jest pokazywana jako 58%. Etykieta „Sommelier’s pairing” / „Para sommeliera” jest przypisana wyłącznie do tierów 0 i 1; pierwsze wino tieru 2 aplikacja gościa nazywa „Recommended for your dish” / „Polecane do Twojego dania”. Teksty wyjaśnień „Jak to działa” biorą liczby z `ENGINE_FACTS` (§10).

Odrzucenie (`rejected`) to sygnał negatywny także dla przyszłego modelu uczonego.

## 6. Cena

- **Budżet gościa to filtr twardy:** dla `serving=glass` porównywana cena kieliszka, dla `bottle` — butelki, dla `any` — kieliszka, jeśli istnieje, w przeciwnym razie butelki.
- **Gdy budżet wyklucza wszystko,** silnik zdejmuje sam budżet (nie inne filtry) i zwraca `BUDGET_FALLBACK_COUNT` = 2 najlepsze wina z komunikatem *„Nothing matches under 45 zł. These are the closest options.”* — gość nie widzi pustego ekranu.
- **Stolik** luzuje budżet tak samo (reguła `table.budget_relaxed`, §8), ale tylko na żądanie wołającego: ekrany gościa i kelnera przekazują `relaxBudget: true`, publiczne API (`POST /api/v1/recommendations/table`) nie — tam `maxPrice` pozostaje filtrem twardym, a wynik może być pusty (zmiana znaczenia pola w API wymagałaby ścieżki z `BACKWARD_COMPATIBILITY.md` §2).
- **Best value:**
  1. jeśli sommelier oznaczył parę jako `best_value` i jest na liście → ta para;
  2. w przeciwnym razie: najtańsza butelka (pomijając pozycję nr 1), której wynik jest najwyżej `BEST_VALUE_WINDOW` = 8 punktów niższy od najlepszego, i która jest tańsza od pozycji nr 1.
  Maksymalnie jedna odznaka na listę.
- Cena **nie** podnosi wyniku dopasowania — silnik nie promuje droższych win. Pole do przyszłej optymalizacji marży jest wyłącznie po stronie restauracji (pricing intelligence), nigdy w rankingu gościa bez jawnej zgody sommeliera.

## 7. Kieliszek / butelka

| Preferencja | Filtr | Cena wyświetlana |
|---|---|---|
| `any` | brak | kieliszek i butelka (jeśli są) |
| `glass` | `glassPrice != null` | kieliszek (z pojemnością, 75 ml dla win słodkich) |
| `bottle` | brak | butelka |

Gdy Primary sommeliera jest dostępne tylko na butelki, a gość wybrał kieliszek, Primary nie jest pokazywane (filtr gościa jest twardy), a pierwsze miejsce zajmuje kolejna para. Dla stolika domyślne serwowanie to butelka.

## 8. Rekomendacja dla całego stolika

Dla każdego aktywnego wina spełniającego filtry:

```
score_d   = pairing_score(d, wine)
            + 3        jeśli para (d, wine) zatwierdzona przez sommeliera (max 99)    // TABLE_SOMMELIER_BONUS, MAX_SCORE
            min(·, 50) jeśli para (d, wine) odrzucona                         // TABLE_REJECTED_CAP
waga_d    = 1.5 dla Mains, 1.0 dla Starters                                  // TABLE_MAINS_WEIGHT
mean      = Σ waga_d · score_d / Σ waga_d
overall   = round(0.6 · mean + 0.4 · min_d score_d)                          // TABLE_MEAN_WEIGHT, TABLE_MIN_WEIGHT
```

Lista dla stolika ma `TABLE_LIMIT` = 3 butelki.

- **Składnik minimum (0,4)** sprawia, że wino genialne do jednego dania i słabe do drugiego przegrywa z winem dobrym do wszystkiego — butelka dla stolika ma być kompromisem.
- **Desery są odkładane** z obliczenia butelki (z komunikatem), chyba że stolik zamówił wyłącznie desery.
- **Sortowanie:** `overall + preferencje` malejąco, potem najsłabsze danie malejąco, cena rosnąco, `wine.id`.
- **Propozycja kieliszków:** jeśli najlepsza butelka ma `overall < 76` (`COMPROMISE_THRESHOLD`) lub któreś danie `< 64` (`WEAK_DISH_THRESHOLD`), silnik dodaje sekcję „Or by the glass, dish by dish” (najlepszy kieliszek do każdego dania wg `recommendForDish` z `serving=glass`).

Przykład z mockupu: Tatar 83, Risotto 93 (para sommeliera), Kaczka 83 (para sommeliera) → Savigny-lès-Beaune, overall 85. Sandacz + Ribeye → najlepsza butelka Morgon 70% → system proponuje kieliszki osobno.

### Wynik surowy i wynik rankingowy per danie

Każde danie pozycji stolika (`TableDishScore`) ma dwa wyniki (spec `2026-10-16-whole-table-waiter-path`, R1):

| Pole | Wartość | Do czego |
|---|---|---|
| `engineScore` | `pairing_score(d, wine)` — bez premii sommeliera i bez limitu 50 | **jedyny wynik per danie, który wolno wyświetlić** (R02, AGENTS §7), i podstawa `table.fit` |
| `score` | `score_d` ze wzoru wyżej (premia +3, limit 50) | wyłącznie `overall` i ranking |

Obok są `sommelierPick` (para `approved` / `modified`) i `rejected` (para odrzucona). Publiczne API zwraca dalej `perDish.score` (wynik rankingowy) — bez zmian kształtu.

### Reguła `table.fit` — „pasuje do n z m”

Identyfikator dokumentacyjny (stolik nie emituje `Factor`). Każda pozycja ma `fit = { fits, of, weaker, compromise }` (`tableFit(perDish, overall)`):

- `of` — liczba dań w obliczeniu butelki (bez odłożonych deserów);
- `fits` — dania z `engineScore ≥ TABLE_FIT_THRESHOLD` (**70**) **i bez pary odrzuconej przez sommeliera** (odrzucona para zawsze „słabiej” — silnik obniża ją w rankingu do 50, więc „pasuje” byłoby sprzeczne z decyzją sommeliera);
- `weaker` — pozostałe dania, rosnąco po `engineScore`, remis — kolejność wyboru;
- `compromise` — `overall < COMPROMISE_THRESHOLD` lub najsłabsze danie (wynik rankingowy) `< WEAK_DISH_THRESHOLD`: ten sam test co propozycja kieliszków, ale dla każdej pozycji; dla `of = 1` zawsze `false`. Dla pierwszej pozycji równa się `splitSuggested`.

Para zatwierdzona z niskim surowym wynikiem (np. 58%) nie „pasuje” — pieczęć zostaje przy daniu. Próg 70 to ta sama granica, od której `tableWhy` mówi „też dobrze”. Ranking, `overall` i kolejność pozycji się nie zmieniają. Przykłady (Halka, dane demo): śledź + przegrzebki + sandacz + seler + antrykot + jeleń → Radikon Slatnik 73, `fit` 5 z 6, słabiej: jeleń (67); tatar + risotto + kaczka + sandacz → Leflaive Mâcon-Verzé 86, 4 z 4.

### Reguła `table.budget_relaxed` — budżet stolika bez pustego ekranu

Identyfikator dokumentacyjny. `recommendForTable(…, locale, { relaxBudget: true })`: gdy budżet wyklucza wszystkie wina, silnik zdejmuje sam budżet (kolor i serwowanie zostają) i zwraca `BUDGET_FALLBACK_COUNT` = 2 najlepsze pozycje z `notice = budgetNotice(maxPrice, locale)`; `splitSuggested` i `split` liczone z tych pozycji. Komunikat budżetu z listy kieliszków (`recommendForDish` w propozycji kieliszków) jest pomijany. Bez luzowania (domyślnie, także w API) `notice = null`. Budżet porównuje cenę według serwowania stolika (butelka, chyba że wybrano kieliszek). Gdy pusty wynik daje sam filtr koloru, luzowanie nic nie zmienia (`[]`, `notice = null`). Przykład (Halka): tatar + risotto + kaczka + sandacz do 150 zł (najtańsza butelka 165 zł) → Leflaive, Radikon i komunikat; czerwone do 200 zł (najtańsza czerwona 230 zł) → Lapierre, Savigny.

Limit dań: serwis (`RecommendationService.forTable`) bierze pierwsze `MAX_TABLE_DISHES` = 12 opublikowanych dań (ten sam limit co schemat API).

## 9. Preferencje miękkie

| Preferencja | Efekt na `rankScore` |
|---|---|
| Lighter | +4 przy body ≤ 2, −4 przy body ≥ 4 |
| Fuller | +4 przy body ≥ 4, −4 przy body ≤ 2 |
| Adventurous | +5 dla `adventurous` |
| Classic | −5 dla `adventurous` |

Preferencje miękkie nie zmieniają wyświetlanego wyniku.

## 10. Determinizm i testowalność

- brak losowości, czasu i sieci w funkcjach silnika;
- jawne rozstrzyganie remisów (`wine.id`);
- wersja silnika (`ENGINE_VERSION`) zapisywana przy każdym wyniku i evencie;
- testy w `packages/core/tests/engine.test.ts` obejmują m.in.: determinizm, zakres 0–99 dla całej macierzy, czerwone > białe do ribeye, karę za taniny z rybą, półwytrawny Riesling do ostrego dania, wykluczenie win deserowych do dań wytrawnych, pierwszeństwo Primary nad wyższym wynikiem modelu, wykluczenie par odrzuconych, filtr kieliszka, luzowanie budżetu z komunikatem, uczciwy Match Score, wzór dla stolika, odkładanie deserów, propozycję kieliszków, surowy wynik per danie przy stoliku, reguły `table.fit` i `table.budget_relaxed` (bloki `describe` o tych nazwach) oraz drafter importu;
- **test złoty** (`packages/core/tests/engine-golden.test.ts`, migawki w `tests/__snapshots__/engine-golden.*.txt`): pełne wyniki `recommendForDish` dla każdego dania demo i `recommendForTable` dla każdej pary i trójki dań demo × 18 zestawów preferencji (domyślne, kieliszek / butelka, każdy styl, budżet 0 / 60 / 200, lżejsze / pełniejsze, klasyczne / odważne) oraz scenariusz z odrzuconymi parami. `npm run engine:matrix` obejmuje tylko `pairing_score`; test złoty pilnuje warstwy rankingu nad nim (filtry, tiery, okno „Najlepsza cena”, luzowanie budżetu, wagi stolika, premia i limit 50). Migawkę zmienia się świadomie (`npx vitest run tests/engine-golden.test.ts -u` w `packages/core`) tylko razem ze specyfikacją zmiany wyników i podniesieniem `ENGINE_VERSION`;
- produkcyjnie dodatkowo: **testy złote** dla restauracji referencyjnych (ich własne karty); każda zmiana reguł pokazuje diff rankingów do akceptacji.

### Stałe silnika i `ENGINE_FACTS`

Liczby, które opisują działanie silnika (wyjaśnienia „Jak to działa”, spec `2026-10-16-how-it-works-explanations`), są nazwanymi stałymi w kodzie silnika, a `packages/core/src/engine/facts.ts` zbiera je w jeden zamrożony obiekt `ENGINE_FACTS` (typ `EngineFacts`, eksport z `@wine-match/core`). Teksty dla gości, kelnerów i sommeliera biorą liczby z `ENGINE_FACTS` jako parametry, nigdy jako literały — zmiana kalibracji nie zostawi nieaktualnego wyjaśnienia. Nowy próg opisywany w tekście dopisuje się jako nazwaną stałą w silniku i pole w `ENGINE_FACTS`.

| Pole `ENGINE_FACTS` | Stała | Wartość | Gdzie działa |
|---|---|---|---|
| `baseScore` | `BASE_SCORE` | 72 | §4, start każdej pary |
| `maxScore` | `MAX_SCORE` | 99 | §4, §8, góra skali |
| `minModelScore` | `MIN_MODEL_SCORE` | 62 | §5, próg propozycji silnika |
| `sommelierRankBoost` | `SOMMELIER_BOOST` | 6 | §5, premia w `rankScore` (nie w Match Score) |
| `dishLimit` | `DEFAULT_LIMIT` | 4 | §5, win dla dania |
| `budgetFallbackCount` | `BUDGET_FALLBACK_COUNT` | 2 | §6, najbliższe propozycje poza budżetem |
| `bestValueWindow` | `BEST_VALUE_WINDOW` | 8 | §6, okno „Najlepsza cena” |
| `tableLimit` | `TABLE_LIMIT` | 3 | §8, butelek dla stolika |
| `tableMeanWeight` / `tableMinWeight` | `TABLE_MEAN_WEIGHT` / `TABLE_MIN_WEIGHT` | 0,6 / 0,4 | §8, wzór `overall` |
| `tableMainsWeight` | `TABLE_MAINS_WEIGHT` | 1,5 | §8, waga dania głównego |
| `tableSommelierBonus` | `TABLE_SOMMELIER_BONUS` | 3 | §8, para sommeliera przy stoliku |
| `tableRejectedCap` | `TABLE_REJECTED_CAP` | 50 | §8, para odrzucona przy stoliku |
| `tableFitThreshold` | `TABLE_FIT_THRESHOLD` | 70 | §8, `table.fit` — „pasuje” od tego surowego wyniku |
| `compromiseThreshold` | `COMPROMISE_THRESHOLD` | 76 | §8, propozycja kieliszków |
| `weakDishThreshold` | `WEAK_DISH_THRESHOLD` | 64 | §8, propozycja kieliszków |

Nazwanie stałych nie zmieniło wyników (test złoty na migawce sprzed zmiany), więc `ENGINE_VERSION` pozostał bez zmian.

### Historia wersji

| Wersja | Zmiana |
|---|---|
| `wm-rules-1.0.0` | reguły §4–§9 |
| `wm-rules-1.1.0` | nowe reguły stolika `table.fit` i `table.budget_relaxed` (opcja), surowy `engineScore` per danie (spec `2026-10-16-whole-table-waiter-path`, F1). Minor (BC §7): ranking, `overall` i wyniki API bez zmian — test złoty przechodzi na migawkach z `wm-rules-1.0.0`. |

## 11. Gdzie (opcjonalnie) pomaga LLM

Nigdy w ścieżce zapytania gościa. Wyłącznie w krokach jednorazowych, na własnej infrastrukturze, z modelami open-source (np. Qwen2.5-7B-Instruct lub Llama 3.1 8B przez Ollama / vLLM, kwantyzacja 4-bit na jednym GPU lub CPU):

| Zastosowanie | Kiedy | Wynik |
|---|---|---|
| Strukturyzacja PDF menu / karty win | import | wiersze JSON → podgląd do poprawy |
| Pierwszy draft profilu dania | import, gdy reguły słów kluczowych mają niską pewność | `DishProfile` ze statusem `draft` |
| Uzupełnienie profilu wina spoza katalogu | import | `WineProfile` (`source: catalog`) |
| Alternatywne sformułowania „Why it works” | przy publikacji, per para | zapisane teksty, zatwierdzane zbiorczo |

Wyniki są zapisywane i cache’owane; normalne korzystanie z aplikacji nie generuje żadnych kosztów API. W MVP (i w mockupie) wszystkie te kroki realizują deterministyczne reguły z `packages/core/src/engine/drafts.ts`.

## 12. Roadmapa modelu

| Etap | Co | Dane |
|---|---|---|
| v1 (MVP) | reguły + afinicje, wagi ręczne | wiedza sommelierska |
| v1.x | strojenie wag per restauracja na podstawie decyzji sommeliera (np. regresja na `SommelierDecision`: approve = 1, reject = 0), z limitami zmian | decyzje sommelierów |
| v2 | embeddingi dań i win (opisy + profile; `pgvector`) — podobieństwo do par zatwierdzonych w innych restauracjach jako dodatkowa cecha `similar_approved` | katalog, pary z wielu lokali |
| v3 | model rankingowy LightGBM / XGBoost (LambdaMART) na cechach: czynniki reguł, różnice profili, cena względna, serwowanie, pora, decyzje sommeliera; cel: `wine_selected` i decyzje sommeliera; reguły zostają jako cechy i jako twarde ograniczenia | GuestInteraction, SalesRecord |
| v3+ | personalizacja (profile smaku gości, między restauracjami) | zgoda gościa, konto |

Na każdym etapie warstwa sommeliera (tiery, odrzucenia) pozostaje ponad modelem, a nowa wersja wchodzi przez rollout procentowy z porównaniem konwersji (A/B per sesja).

## 13. Okazje w panelu sommeliera (poza silnikiem)

Spec `2026-10-16-sommelier-opportunities` (E10, D17). Okazja to jedno zdanie z liczbami, które mówi sommelierowi „zobacz tutaj”. **To nie są reguły silnika:** nie zmieniają wyniku, kolejności ani etykiety rekomendacji (R02) i nie wchodzą do `ENGINE_VERSION`. Kod: `packages/core/src/services/opportunities/` (`opportunity-rules.ts` — czyste funkcje, `opportunity-service.ts` — `OpportunityService`), testy: `packages/core/tests/opportunities.test.ts`.

- **Liczone przy odczycie**, z bieżących danych jednej restauracji (karta, wina, pary w każdym statusie). Macierz `pairingScore` (opublikowane dania × aktywne wina) jest liczona raz na żądanie i współdzielona przez reguły; reguły same nie wołają silnika. Wynik to zawsze bieżący `pairingScore(dish, wine).score`, bez podbijania.
- **Determinizm:** `findOpportunities` nie używa zegara ani losowości; ta sama karta w dowolnej kolejności tablic daje tę samą listę. Remisy: najwyższy wynik, potem `id` (porządek znaków, nie `localeCompare`).
- **Proponujemy** tylko danie `published` i wino `active`. „Bez decyzji” = brak pary (danie, wino) w jakimkolwiek statusie, więc para `rejected` blokuje okazję na stałe (R4). „Zatwierdzona” = `approved` | `modified`.

| # | `rule` | Faza | Warunek | Akcja |
|---|---|---|---|---|
| S1 | `dish_no_primary` | F1 | danie `published`, bez par `suggested` (wtedy prowadzi je A7), bez zatwierdzonej pary Primary z aktywnym winem. Powód: `none` (brak zatwierdzonych par), `no_primary` (są, ale żadna nie jest Primary), `primary_hidden` (wino Primary jest ukryte; wymienione jako dowód, nigdy proponowane) | otwórz pary |
| S2 | `glass_match_unpaired` | F1 | danie `published`; żadna zatwierdzona para dania nie ma aktywnego wina na kieliszek; jest aktywne wino na kieliszek bez decyzji dla dania z wynikiem ≥ `STRONG_MATCH`. Jedno na danie: najwyższy wynik, remis → `wine.id` | dodaj do propozycji |
| S3 | `wine_unpaired` | F1 | aktywne wino bez zatwierdzonej pary z żadnym daniem `published`; jego najlepsze danie `published` bez decyzji ma wynik ≥ `STRONG_MATCH` (remis → `dish.id`). Jedno na wino, w grupie tego dania | dodaj do propozycji |
| S4 | `shown_rarely_chosen` | F3 | para Primary rzadko wybierana przez gości (E04 `pairingStats`) | otwórz pary |
| S5 | `ordered_not_reviewed` | F4 | para zamawiana z kodem polecenia (E09 `pairStats`), niezatwierdzona | zatwierdź / dodaj |

**Progi** (stałe w `opportunity-rules.ts`): `STRONG_MATCH = 85` (mniej więcej „jedno z 2–3 najlepszych win dania” w macierzy Halki; zmiana `ENGINE_VERSION` wymaga ponownej kalibracji — pilnuje tego test „Halka”), `DISMISS_DAYS = 30`. Progi S4/S5 (`MIN_SHOWN`, `MIN_OTHER_CHOSEN`, `LOW_RATE_FACTOR`, `MIN_ORDERS`, okno 28 dni) dochodzą w F3/F4.

**Klucz** to przedmiot okazji, nie konkretna propozycja: `dish_no_primary:{dishId}:{reason}`, `glass_match_unpaired:{dishId}`, `wine_unpaired:{wineId}`, `{rule}:{dishId}:{wineId}` (S4, S5); format sprawdza `opportunityKeySchema`.

**Potok:** kandydaci każdej reguły → odrzucenie kluczy aktywnie zignorowanych → jedna okazja na (danie, wino), wygrywa reguła wcześniejsza w porządku S1, S5, S2, S3, S4 → sortowanie: kategoria dania (Przystawki, Dania główne, Desery), nazwa dania (`localeCompare` z `'pl'`), `id` dania, potem reguła w tym porządku i `id` wina. Zignorowanie S2 dania nie odsłania kolejnego wina; S3 tego samego wina może się pokazać (inny przedmiot).

**Akcje** (komendy z `actor`): „Dodaj do propozycji” = `SommelierService.addSuggestion` — para `suggested` przez `pairingWriteRepository.addSuggestions` (`source: 'engine'`, bieżący wynik, `updatedBy` = autor, bez wpisu historii i bez `dirty`, więc nie podbija licznika publikacji; wymaga dania `published`, aktywnego wina i wyniku ≥ `MIN_MODEL_SCORE`; istniejąca para → `already_paired` / `already_suggested` / `already_rejected`). Gość nie widzi nic do „Approve” i publikacji. „Ignoruj” = `OpportunityService.dismiss` (tylko klucz bieżącego kandydata, inaczej `opportunity_stale`; ponowne przedłuża termin), „Przywróć” = `restore` (`opportunity_not_dismissed`, gdy nie ma czego przywrócić). Tabela: `opportunity_dismissal` ([DATA_MODEL.md](DATA_MODEL.md)).

**Ekrany (F2):** A14 `/admin/{slug}/opportunities` (wszystkie okazje, `scope: 'all'`), karta na A6 (okazje S1–S3 dania, `scope: 'dish'`) i linia „Opportunities: n” na A1 (S1–S3 całej karty); szczegóły w [SCREEN_SPECIFICATION.md](SCREEN_SPECIFICATION.md) (A1, A6, A14). Zdanie każdej okazji buduje aplikacja ze słownika (`admin.opportunities.sentences`) z `evidence`.

**Halka (dane demo, `wm-rules-1.1.0`):** przy pierwszym otwarciu 6 okazji — S1 = 0 (każde danie ma propozycje albo Primary), S2 = 2 (przegrzebki i sandacz → Solaris 85 na kieliszek; remis 85 z Rieslingiem Kabinett i Sancerre rozstrzyga `id`), S3 = 4 (Sancerre 87 i Riesling Kabinett 87 → śledź bałtycki, De Nit Rosé 86 i Bannockburn Pinot Noir 85 → risotto). Deska serów nie daje S2, bo jest szkicem (`draft`). Lista jest zapisana w teście.
