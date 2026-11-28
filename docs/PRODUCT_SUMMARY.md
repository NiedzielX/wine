# Wine Match: opis w jednej stronie

**Wersja 1.0.0 · platforma B2B2C rekomendacji win dla restauracji**

## Problem
Restauracje z kartą win sprzedają mniej wina, niż mogłyby. Gość przy stoliku nie wie, co pasuje do jego dania. Kelner nie zawsze jest sommelierem. Sommelier nie zdąży porozmawiać z każdym stolikiem. Karta win jest długa i trudna do ogarnięcia. Efekt: gość zamawia najtańsze wino albo wcale, a wiedza sommeliera dociera tylko do części gości.

## Rozwiązanie
Cyfrowa warstwa programu winnego. Gość skanuje kod QR przy stoliku, wybiera danie i widzi, które wina **z karty tej restauracji** do niego pasują, z ceną i krótkim „dlaczego". Działa na telefonie, po polsku i angielsku, bez rejestracji i bez instalowania aplikacji.

## Dla kogo
- **Gość i kelner:** szybka, zrozumiała podpowiedź przy stoliku, także dla całego stołu. Kod polecenia do pokazania kelnerowi.
- **Sommelier / Wine Director:** panel z kolejką par danie–wino. Zatwierdza i poprawia propozycje, publikuje menu. Para zatwierdzona przez sommeliera ma pierwszeństwo przed silnikiem i jest oznaczona „Para sommeliera".
- **Restauracja:** import menu i karty win (CSV, XLSX, PDF) z podglądem każdego wiersza, kod QR, zespół i role, wybór restauracji (kolejność propozycji silnika), raport wyników z wskaźnikami użycia i sprzedaży (Wine Attach Rate).

## Jak to działa
1. Restauracja wgrywa menu i kartę win.
2. Deterministyczny silnik reguł sommelierskich proponuje pary.
3. Sommelier przegląda, zatwierdza lub zmienia pary i publikuje.
4. Gość widzi wyłącznie opublikowaną wersję.

## Zasady, na których stoi produkt
- **Sommelier ponad modelem.** Etykieta „Para sommeliera" tylko dla par zatwierdzonych lub zmienionych przez człowieka. Wyświetlany Match Score to zawsze wynik silnika, bez podbijania.
- **Silnik jest deterministyczny.** Te same dane dają ten sam wynik. Zwykłe korzystanie nie wywołuje płatnych zewnętrznych API, a w interfejsie gościa nie ma komunikatów o „AI".
- **Izolacja restauracji.** Każde zapytanie do danych jest ograniczone do jednej restauracji. Uprawnienia sprawdza każde wejście osobno.
- **Bez zasobów zewnętrznych w runtime.** Fonty, ikony i biblioteki są lokalne.

## Stan techniczny
Next.js 16 / React 19 / TypeScript, PostgreSQL + MikroORM, monorepo (`core`, `db`, `ui`, `app`). Zmiany przechodzą bramkę CI: lint, testy jednostkowe, testy bazy, e2e, build, skan sekretów, a11y, design i obraz. Wersja 1.0.0 (wydanie na GitHubie, historia zmian w `CHANGELOG.md`). Aplikacja działa na Vercel z bazą PostgreSQL (Supabase); wycofanie wdrożenia opisuje `docs/DEPLOYMENT.md` §17.2.

## Następny krok
Archiwizacja (miękkie usunięcie) dań i win: specyfikacja zatwierdzona (`.ai/specs/2026-11-27-archive-dishes-wines.md`), implementacja przed nami. Dziś dania i wina można dodawać, edytować i ukrywać, ale nie usuwać.
