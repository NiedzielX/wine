# Wine Match

[![CI](https://github.com/NiedzielX/wine/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NiedzielX/wine/actions/workflows/ci.yml)

Cyfrowa warstwa programu winnego restauracji: gość skanuje kod QR przy stoliku, wybiera danie i widzi, które wina **z karty tej restauracji** do niego pasują, z ceną i krótkim „dlaczego”. Wiedza sommeliera trafia na każdy stolik, a restauracja widzi, jak rośnie sprzedaż wina.

## Do kogo jest

- **Restauracje** z kartą win, które chcą sprzedawać więcej wina bez zatrudniania kolejnych osób i bez utraty kontroli nad kartą.
- **Sommelierzy i Wine Directorzy**, których pairingi mają docierać do każdego gościa, nie tylko do tych, z którymi zdążą porozmawiać.
- **Goście i kelnerzy**: telefon przy stoliku, bez rejestracji i bez instalowania aplikacji.

## Co potrafi

- **Gość:** QR → danie → najlepiej pasujące wina z karty restauracji (cena kieliszka lub butelki, krótkie wyjaśnienie), także dla całego stołu, po polsku i angielsku. Kod polecenia pokazywany kelnerowi.
- **Sommelier:** panel z kolejką pairingów, zatwierdzanie i poprawianie par (sommelier ma pierwszeństwo przed silnikiem), publikacja menu dla gości.
- **Restauracja:** import menu i karty win z CSV, XLSX lub PDF z podglądem każdego wiersza, kod QR, zespół i role, KPI użycia i sprzedaży (Wine Attach Rate).

Rekomendacje liczy własny, deterministyczny silnik reguł sommelierskich; zwykłe korzystanie z aplikacji nie wywołuje żadnego płatnego zewnętrznego API.

## Jak to działa

1. **Restauracja wgrywa menu i kartę win.** Silnik proponuje pary danie–wino według reguł sommelierskich.
2. **Sommelier przegląda propozycje**, zatwierdza lub zmienia je i publikuje. Goście widzą tylko opublikowaną wersję.
3. **Gość skanuje QR**, wybiera danie i dostaje wina z tej karty; para zatwierdzona przez sommeliera jest oznaczona jako „Para sommeliera”.

## Szybki start

Tryb demo, bez bazy danych. Wymagania: **Node.js ≥ 22.17** i **npm ≥ 11.6** (npm 10 dołączany do Node 22 nie instaluje Vitest 5; zaktualizuj go: `npm install -g npm@11`).

```bash
npm install
cp .env.example .env          # domyślnie DATA_SOURCE=memory: dane demo bez bazy
npm run dev                   # http://localhost:3000 → /r/halka
```

Po uruchomieniu:

- strona gościa demo restauracji Halka: <http://localhost:3000/r/halka>,
- panel: <http://localhost:3000/admin/login>; konta demo i ich **publiczne** hasło są w [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (sekcja „Logowanie do panelu”). Konta demo nie mogą istnieć na prawdziwej instalacji.

PostgreSQL, konfiguracja, polecenia i testy: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Stan projektu

Wersja `0.4.0` (tag `v0.4.0`, wydanie na GitHubie). Aplikacja jest wdrożona na Vercel z bazą PostgreSQL (Supabase); definicja wersji 1.0 nie jest ustalona. Co jest zbudowane, a co w toku: sekcja „Stan prac” w [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) i [CHANGELOG.md](CHANGELOG.md). Założenia o odbiorcach produktu nie zostały zweryfikowane badaniami (brief produktu: [.ai/specs/product-brief.md](.ai/specs/product-brief.md)).

## Dokumentacja

| Dokument | Zawartość |
|---|---|
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | architektura, pakiety, konfiguracja (`.env`), polecenia, testy i CI, adresy ekranów, zakres MVP, stan prac, mapa repozytorium, pełny spis dokumentacji |
| [docs/PRODUCT_CONCEPT.md](docs/PRODUCT_CONCEPT.md) | problem, propozycja wartości, model B2B2C, KPI |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/OPERATIONS.md](docs/OPERATIONS.md) | wdrożenie, wycofanie, operacje i alerty |
| [docs/RELEASING.md](docs/RELEASING.md), [CHANGELOG.md](CHANGELOG.md), [UPGRADE_NOTES.md](UPGRADE_NOTES.md) | wydawanie wersji, historia zmian, co zrobić przy zmianie niezgodnej wstecz |
| [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) | jak wnosić zmiany; zasady pracy i architektury dla ludzi i agentów |
| [SECURITY.md](SECURITY.md), [docs/security/threat-model.md](docs/security/threat-model.md) | zgłaszanie podatności, model zagrożeń |
