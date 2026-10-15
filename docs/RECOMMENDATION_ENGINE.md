# Wine Matching Engine v1 (`wm-rules-1.0.0`)

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
pairing_score(dish, wine) = clamp(0, 99, round(72 + Σ delta_i))
```

Bazą jest 72 („neutralne, akceptowalne połączenie”). Każda reguła dodaje lub odejmuje punkty i jest zapisywana jako czynnik `{rule, delta, why?}`. Wynik jest więc w pełni wyjaśnialny: sommelier widzi, dlaczego coś zostało zaproponowane, a testy sprawdzają konkretne reguły.

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
4. Limit: 4 pozycje.

`rankScore = matchScore + preferencje + (tier < 2 ? 6 : 0)`. **Wyświetlany Match Score to zawsze `matchScore` silnika** — zatwierdzenie zmienia kolejność, nie liczbę. Para sommeliera z wynikiem 58% jest pokazywana jako 58%. Etykieta „Sommelier recommendation” jest przypisana wyłącznie do tierów 0 i 1.

Odrzucenie (`rejected`) to sygnał negatywny także dla przyszłego modelu uczonego.

## 6. Cena

- **Budżet gościa to filtr twardy:** dla `serving=glass` porównywana cena kieliszka, dla `bottle` — butelki, dla `any` — kieliszka, jeśli istnieje, w przeciwnym razie butelki.
- **Gdy budżet wyklucza wszystko,** silnik zdejmuje sam budżet (nie inne filtry) i zwraca 2 najlepsze wina z komunikatem *„Nothing matches under 45 zł. These are the closest options.”* — gość nie widzi pustego ekranu.
- **Best value:**
  1. jeśli sommelier oznaczył parę jako `best_value` i jest na liście → ta para;
  2. w przeciwnym razie: najtańsza butelka (pomijając pozycję nr 1), której wynik jest najwyżej 8 punktów niższy od najlepszego, i która jest tańsza od pozycji nr 1.
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
            + 3        jeśli para (d, wine) zatwierdzona przez sommeliera (max 99)
            min(·, 50) jeśli para (d, wine) odrzucona
waga_d    = 1.5 dla Mains, 1.0 dla Starters
mean      = Σ waga_d · score_d / Σ waga_d
overall   = round(0.6 · mean + 0.4 · min_d score_d)
```

- **Składnik minimum (0,4)** sprawia, że wino genialne do jednego dania i słabe do drugiego przegrywa z winem dobrym do wszystkiego — butelka dla stolika ma być kompromisem.
- **Desery są odkładane** z obliczenia butelki (z komunikatem), chyba że stolik zamówił wyłącznie desery.
- **Sortowanie:** `overall + preferencje` malejąco, potem najsłabsze danie malejąco, cena rosnąco, `wine.id`.
- **Propozycja kieliszków:** jeśli najlepsza butelka ma `overall < 76` lub któreś danie `< 64`, silnik dodaje sekcję „Or by the glass, dish by dish” (najlepszy kieliszek do każdego dania wg `recommendForDish` z `serving=glass`).

Przykład z mockupu: Tatar 83, Risotto 93 (para sommeliera), Kaczka 83 (para sommeliera) → Savigny-lès-Beaune, overall 85. Sandacz + Ribeye → najlepsza butelka Morgon 70% → system proponuje kieliszki osobno.

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
- testy w `packages/core/tests/engine.test.ts` obejmują m.in.: determinizm, zakres 0–99 dla całej macierzy, czerwone > białe do ribeye, karę za taniny z rybą, półwytrawny Riesling do ostrego dania, wykluczenie win deserowych do dań wytrawnych, pierwszeństwo Primary nad wyższym wynikiem modelu, wykluczenie par odrzuconych, filtr kieliszka, luzowanie budżetu z komunikatem, uczciwy Match Score, wzór dla stolika, odkładanie deserów, propozycję kieliszków oraz drafter importu;
- produkcyjnie dodatkowo: **testy złote** — zamrożona macierz wyników dla restauracji referencyjnych; każda zmiana reguł pokazuje diff rankingów do akceptacji.

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
