# User flows

Każdy flow ma diagram, opis kroków z adresem ekranu w mockupie (hash route) oraz liczbę interakcji. Wszystkie flow da się przeklikać w mockupach bez backendu.

---

## 1. Guest: QR → Restaurant → Dish → Wine recommendations → Filters → Wine selection

```mermaid
flowchart LR
  QR([Scan QR]) --> L[Restaurant landing + menu<br>/r/halka]
  L -->|tap dish| R[Wine recommendations + quick preferences<br>/r/halka/dish/:id/wines]
  M[Dish list<br>/r/halka/menu] -->|tap dish| R
  R -->|Back| M
  R -->|Refine| F[[Filters sheet<br>?sheet=filters]]
  F -->|Show N wines| R
  R -->|tap wine| W[Wine details<br>/r/halka/wine/:id?dish=]
  W -->|Choose this wine| C[Confirmation<br>/r/halka/selected/:id]
  C -->|Pair another dish| M
  R -. no results .-> E1[Empty state<br>Clear filters]
  R -. budget too low .-> N1[Notice + closest options]
```

| Krok | Ekran | Akcja gościa | System |
|---|---|---|---|
| 1 | Landing z menu | skan QR | nagłówek restauracji i menu na jednym ekranie, eventy `guest_session_started`, `menu_viewed` |
| 2 | Landing z menu | wybór dania | `GET /dishes/{id}/recommendations?…`, event `recommendations_viewed` |
| 3 | Recommendations | opcjonalnie: szybkie preferencje (By the glass / By the bottle / Red / White / Sparkling) albo „More…” → arkusz filtrów | przeliczenie listy; preferencje zostają w URL dla kolejnych dań |
| 7 | Recommendations | wybór wina | event `recommendation_clicked`, `wine_viewed` |
| 8 | Wine details | kieliszek / butelka → „Choose this wine” | event `wine_selected` |
| 9 | Confirmation | pokazanie telefonu kelnerowi | event `selection_shown_to_waiter` |

**Najkrótsza ścieżka do listy win: 1 dotknięcie** (danie na stronie z kodu QR). Do wyboru wina: 3. Stare adresy `/r/{slug}/dish/{id}` przekierowują (308) na listę win. Na desktopie (≥ 1024 px) menu zostaje w lewej kolumnie obok win (spec `2026-10-15-guest-short-path-and-desktop`).

---

## 2. Whole table: Restaurant → Multiple dishes → Best bottle for table → Recommendation

```mermaid
flowchart LR
  L[Restaurant landing] -->|Pair a bottle for the table| T[Whole table selection<br>/r/halka/table]
  M[Dish list] -->|Whole table tab| T
  T -->|tick 2+ dishes<br>optional colour and budget| T
  T -->|Find a bottle for the table| B[Best wine for your table<br>/r/halka/table/result]
  B -->|tap best or alternative| W[Wine details ?table=1]
  B -. dishes too different .-> S[Or by the glass,<br>dish by dish]
  S -->|tap| W2[Wine details ?dish=]
  W --> C[Confirmation<br>For the table]
```

| Krok | Ekran | Akcja | System |
|---|---|---|---|
| 1 | Landing / Menu | wejście w tryb stolika | — |
| 2 | Whole table | zaznaczenie dań (licznik, przycisk aktywny od 2) | event `table_dishes_selected` |
| 3 | Whole table | opcjonalnie: kolor, budżet na butelkę | — |
| 4 | Whole table | „Find a bottle for the table” | `POST /recommendations/table` |
| 5 | Best wine for your table | wynik per danie, Overall match, cena; 2 alternatywy; desery odłożone; ewentualna propozycja kieliszków | event `table_recommendation_viewed` |
| 6 | Wine details → Confirmation | jak w flow 1, z domyślną butelką | `wine_selected` z `context=table` |

Przykład z mockupu: Beef tartare 83%, Wild mushroom risotto 93%, Duck breast 83% → Savigny-lès-Beaune, overall 85%.

---

## 3. Sommelier: Login → Menu → Dish → Suggested pairings → Review → Approve → Publish

```mermaid
flowchart LR
  LG[Login<br>/admin/login] --> DB[Dashboard<br>/admin]
  DB -->|Menu| ML[Menu<br>/admin/menu]
  ML -->|tap dish| DD[Dish details<br>/admin/menu/:id]
  DD -->|adjust profile, save| DD
  DD -->|Manage pairings| PM[Pairings<br>/admin/pairings/:dishId]
  PM -->|Approve / Reject<br>role, order, note| PM
  DB -->|Review now| RQ[Review queue<br>/admin/review]
  RQ -->|Approve all| PB[Publish<br>/admin/publish]
  PM -->|nav: Publish| PB
  PB -->|Publish changes| OK([Guests see changes])
  DB -->|Opportunities: n| OP[Opportunities<br>/admin/opportunities]
  OP -->|Add to suggestions / Ignore / Restore| OP
  OP -->|Open pairings| PM
  PM -->|Add to suggestions, then Approve| PM
```

| Krok | Ekran | Akcja | API |
|---|---|---|---|
| 1 | Login | e-mail, hasło | `POST /auth/login` |
| 2 | Dashboard | baner z liczbą propozycji / nawigacja Menu | `GET /restaurants/{id}/analytics/summary` |
| 3 | Menu | wybór dania (status, pokrycie pairingami) | `GET /restaurants/{id}/dishes` |
| 4 | Dish details | korekta profilu (podgląd na żywo), zapis | `PATCH /dishes/{id}` |
| 5 | Pairings | „Approve” propozycji, rola Primary, kolejność, notatka | `PATCH /pairings/{id}`, `POST /pairings/{id}/decisions` |
| 6 | Review queue | przegląd pozostałych dań, „Approve all for this dish” | `POST /restaurants/{id}/pairings/bulk-decision` |
| 7 | Publish | checklista, ustawienia gościa, „Publish changes” | `POST /restaurants/{id}/publish` |
| opcj. | Opportunities (A14) / karta na A6 | „Add to suggestions” (wino trafia do „Engine suggestions” dania; gość nic nie widzi do „Approve” i publikacji), „Ignore” (wraca najwcześniej po 30 dniach), „Restore” | akcje serwerowe (spec `2026-10-16-sommelier-opportunities`, F2), bez REST |

---

## 4. Restaurant onboarding: Create restaurant → Upload menu → Upload wine list → Data review → Generate pairings → Sommelier review → Publish → Generate QR

```mermaid
flowchart TD
  A[Create restaurant<br>System Admin + Setup checklist: details] --> B[Upload menu<br>/admin/import/menu]
  B --> B2[Check and correct rows] --> B3[Imported: dishes as drafts]
  B3 --> C[Upload wine list<br>/admin/import/wines]
  C --> C2[Check and correct rows] --> C3[Imported: wines active]
  C3 --> D[Data review<br>Menu: confirm drafted taste profiles]
  D --> E[Generate pairings<br>Setup checklist: Regenerate suggestions]
  E --> F[Sommelier review<br>/admin/review]
  F --> G[Publish<br>/admin/publish]
  G --> H[Generate QR<br>/admin/qr: SVG, PNG, print]
  H --> I([QR on tables])
```

Ekran **Setup checklist** (`/admin/setup`) pokazuje 8 kroków ze statusem (wykonany / do zrobienia) i przyciskiem przejścia do każdego z nich.

| Krok | Wynik | Warunek „done” w checkliście |
|---|---|---|
| Create restaurant | Restaurant, slug, Wine Director | dane zapisane |
| Upload menu | Dish (`draft`), DishProfile (`draft`) | ≥ 1 danie |
| Upload wine list | Wine, WineProfile | ≥ 1 wino |
| Data review | DishProfile `confirmed` | wszystkie profile potwierdzone |
| Generate pairings | Pairing (`suggested`) | ≥ 1 pairing |
| Sommelier review | Pairing (`approved` / `modified` / `rejected`) | każde danie ma zatwierdzoną parę |
| Publish | PublishedVersion | brak niepublikowanych zmian |
| Generate QR | pliki SVG / PNG | restauracja opublikowana |

---

## 5. Waiter assisted selection

```mermaid
flowchart LR
  S[Staff lookup<br>/r/halka/staff] -->|select dish| S
  S -->|filters from guest: glass, colour, budget| S
  S --> T([Talk to guest using<br>Say: … and list no.])
```

1–2 interakcje: wybór dania z listy, ewentualnie jeden filtr. Kolejność zawsze według sommeliera.

---

## 6. Flow importu (szczegół kroków 2–3 onboardingu)

```mermaid
stateDiagram-v2
  [*] --> Upload
  Upload --> Parsing: file chosen / dropped
  Parsing --> Upload: wrong format, empty file
  Parsing --> Preview: rows parsed
  Preview --> Preview: edit cells, untick rows
  Preview --> Upload: Start over
  Preview --> Preview: validation error (row N)
  Preview --> Imported: Import selected
  Imported --> [*]
```

Statusy `ImportJob`: `uploaded → parsing → preview_ready → confirmed | failed | cancelled`.
