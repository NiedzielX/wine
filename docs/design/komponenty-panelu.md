# Komponenty panelu: kontrakty (lekcja 06)

Źródło: `packages/ui/src`. Każdy komponent: do czego służy, czego użyć zamiast, warianty i stany. Nowy komponent dopisujemy tutaj w tym samym PR. Storybook z tymi stories: `packages/ui` (osobny PR, patrz `docs/DESIGN_SYSTEM.md`).

| Komponent | Służy do | Kiedy NIE używać (zamiast) | Warianty / stany |
|---|---|---|---|
| `Button` | akcja: zapis, przejście, usunięcie | link do innej strony bez akcji (użyj `asChild` z `<Link>`); drugi `default` na ekranie (użyj `outline`) | `variant`: default, destructive, outline, secondary, ghost, link. `size`: default, sm, lg, xs, icon, icon-xs, icon-sm, icon-lg. Stany: hover, focus-visible (obrys), disabled |
| `Badge` | status krótki: rola, liczba, stan | zdanie lub akapit (użyj tekstu) | `variant`: default, secondary, destructive, outline, ghost, link |
| `Alert` | komunikat o stanie strony (ostrzeżenie, błąd, sukces) | błąd formularza przy polu (użyj `Input` z komunikatem pod polem) | `variant`: default, destructive. Tytuł i opis; ikona opcjonalna |
| `Card` | grupa powiązanych treści na jednym ekranie | karta jako link na całość (użyj listy) | `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `Input`, `Textarea`, `NativeSelect` | pole formularza z etykietą | pole bez etykiety (zawsze `Label`); placeholder zamiast etykiety | `NativeSelect` `size`: default, sm. Stany: focus, disabled, invalid (komunikat pod polem) |
| `Label` | etykieta pola (widoczna zawsze) | tytuł sekcji (użyj `CardTitle`) | |
| `Table` | lista danych | układ kafelków (użyj `Card`) | `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| `Progress`, `Skeleton` | postęp lub zajęte miejsce podczas ładowania | stan pusty (użyj `EmptyState`) | |
| `LevelMeter` | poziom na skali 1–5 (np. ocena) | liczba z procentem (użyj tekstu) | `label` do czytnika ekranu, domyślnie „n of 5” |
| `Separator` | podział między blokami | obramowanie zamiast układu (użyj odstępu) | |
| `StatusIcon` | znacznik gotowe / do zrobienia w liście kontrolnej | status jako jedyna informacja (zawsze obok tekstu) | `done`: sage, check; nie done: brass, ostrzeżenie |
| `EmptyState` | lista bez danych, z wyjaśnieniem i akcją | błąd techniczny (użyj `ErrorMessage`) | `title`, `description`, `action` |
| `ErrorMessage` | błąd na ekranie (z opisem, co zrobić) | błąd formularza przy polu | `title`, `message`, `action`, `compact` |
| `LoadingMessage` | ładowanie listy | ładowanie krótkiej akcji (użyj stanu przycisku) | `cards`, `label` |
| `InfoDisclosure` (brand) | jedno wyjaśnienie na ekran lub kartę (`<details>`) | wyjaśnienie w linku lub w przycisku akcji | zamknięty domyślnie, działa bez JS |
| `MatchGlass` (brand) | wynik dopasowania (szklanka) | wynik bez prawdziwego źródła | `value` 0–100, etykieta czytnika ekranu |

## Zasady wspólne

- Kolor statusu zawsze z tekstem albo ikoną (nie sam kolor).
- Granice pól i przycisków: co najmniej 3:1 względem tła (token `border-input` w panelu).
- Komunikat błędu mówi, co zrobić, a nie tylko co jest źle.
- Nie dodawaj koloru ani odstępu spoza tokenów `packages/ui/src/styles.css`; brak w tokenach zgłoś jako lukę, nie wpisuj literału.
