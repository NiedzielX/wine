# Tokeny (lekcja 06, ćwiczenie 2)

Źródło wartości: `packages/app/src/app/(guest)/guest.css` (gość) i `packages/ui/src/styles.css` (panel). Kontrast liczy `scripts/check-design.mjs`.

## Tokeny w trzech warstwach

Warstwa 1 — surowe wartości (tylko `guest.css`, `@theme`): `ink`, `ink-2`, `ink-3`, `line`, `paper`, `surface`, `wine`, `wine-deep`, `on-wine`, `brass`, `brass-soft`, `sage`, `sage-soft`.

Warstwa 2 — role (nazwa mówi, kiedy użyć):

| Rola | Wartość | Kontrast na `paper` |
|---|---|---|
| tekst główny | `ink` | 15,6:1 |
| tekst drugorzędny | `ink-2` | 6,7:1 |
| tekst pomocniczy (AA) | `ink-3` (`#6f646a`) | 5,1:1 |
| obramowanie | `line` | dekoracyjne |
| tło strony | `paper` | |
| powierzchnia karty | `surface` | |
| akcja główna | `wine` | 11,7:1 |
| tekst na akcji głównej | `on-wine` na `wine` | 10,9:1 |
| pieczęć sommeliera | `brass` | 4,5:1 (na granicy) |
| status: dopasowane | `sage` | 5,6:1 |

Pełna tabela tokenów (wartości z `guest.css`, kontrast liczony na tle `paper` `#f5f3f4` i `surface` `#ffffff`):

| Token (warstwa 1) | Hex | Rola (warstwa 2) | Na `paper` | Na `surface` | Do czego |
|---|---|---|---|---|---|
| `ink` | `#22181d` | tekst główny | 15,6:1 | 17,3:1 | nagłówki, treść, ceny |
| `ink-2` | `#5e5258` | tekst drugorzędny | 6,7:1 | 7,4:1 | wyjaśnienia, podpisy, opisy |
| `ink-3` | `#6f646a` | tekst pomocniczy (AA) | 5,1:1 | 5,7:1 | drobne etykiety |
| `line` | `#e4dee1` | obramowanie dekoracyjne | 1,2:1 | 1,3:1 | separatory, obrys karty (nie obrys pola) |
| `paper` | `#f5f3f4` | tło strony | — | — | tło ekranu |
| `surface` | `#ffffff` | powierzchnia karty | — | — | karty, panele, arkusz filtrów |
| `wine` | `#5a1a2c` | akcja główna | 11,7:1 | 13,0:1 | przycisk główny, aktywny stan |
| `wine-deep` | `#3b0f1c` | tło marki (hero) | 15,0:1 | 16,5:1 | nagłówek restauracji |
| `on-wine` | `#f3e9eb` | tekst na marce i akcji | 1,1:1 (na `paper`, nie używać) | 1,2:1 | tekst na `wine` i `wine-deep` (tam 10,9:1 i 13,9:1) |
| `brass` | `#8a6a30` | pieczęć sommeliera | 4,5:1 | 5,0:1 | tylko pieczęć i ikona, nie długi tekst |
| `brass-soft` | `#f3ede1` | tło uwagi | — | — | `Notice` przy informacji o zmianie |
| `sage` | `#3b6a52` | status „dopasowane” | 5,6:1 | 6,2:1 | tekst i ikona statusu pozytywnego |
| `sage-soft` | `#e5efe9` | tło statusu pozytywnego | — | — | tło chipa statusu |

Zasady granic: obramowanie pola formularza ma kontrast co najmniej 3:1 (`ink-3`, nie `line`). `line` to tylko dekoracja, nie granica elementu interaktywnego.

Ciemnego motywu i widoku desktopowego nie ma w tej wersji dokumentu. Wyjaśnione w sekcji 8.

Warstwa 3 — komponenty biorą kolor z roli, nigdy z surowej wartości (`text-ink-2`, nie `text-[#5e5258]`).

Zmiana w tej iteracji: `ink-3` z `#857a80` (3,73:1, poniżej AA) na `#6f646a`. Skrypt sprawdza kontrast wszystkich tokenów tekstowych na tle `paper` i `surface`.


## Tokeny dodane przy audycie (lekcja 06)

| Token | Hex | Rola | Kontrast |
|---|---|---|---|
| `control` | `#8c8087` | granica kontrolek (chipy, przyciski, pola) | 3,8:1 na białym, 3,4:1 na `paper` (WCAG 1.4.11) |
| `wine-soft` | `#f6eef1` | tło wybranej pozycji | |
| `brass-ink` | `#5d4720` | tekst uwagi na jasnym brązie | ponad 4,5:1 na `paper` |
| `page` | `#e9e5e7` | tło strony poza kolumną | |

Panel: tokeny w `packages/ui/src/styles.css` (motyw jasny i ciemny). Kontrast tekstów w obu motywach sprawdza `scripts/check-design.mjs`.
