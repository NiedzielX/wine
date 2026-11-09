# Upgrade notes

Co musi zrobić operator instalacji (albo restauracja, albo integrator API), żeby przejść na nowe wydanie, gdy zmiana **nie jest wstecznie zgodna**. Zmiany zgodne idą tylko do [CHANGELOG.md](CHANGELOG.md). Co jest kontraktem i co jest zmianą łamiącą: [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md). Proces wydania: [docs/RELEASING.md](docs/RELEASING.md).

Zasady:

- PR ze zmianą łamiącą dopisuje wpis w `## [Unreleased]` **w tym samym PR-ze** (i oznaczenie „💥 Breaking” w opisie PR-a, BACKWARD_COMPATIBILITY.md). Pusta sekcja `[Unreleased]` znaczy: nic łamiącego od ostatniego wydania.
- Wpis to nagłówek `### <co się zmienia> (#PR)` i cztery pola, wszystkie obowiązkowe (sprawdza `npm run release:notes -- check`).
- Przy wydaniu `npm run release:notes -- promote X.Y.Z --write` przenosi wpisy pod `## [X.Y.Z] - YYYY-MM-DD` razem z `CHANGELOG.md`, a treść trafia do opisu GitHub Release.
- Wpisów wydanych nie edytujemy (jak migracji); sprostowanie to nowy wpis.

Wzór wpisu (w bloku kodu, więc skrypt go nie czyta):

```md
### Ciasteczko sesji zmienia nazwę z `wm_session` na `wm_sess` (#200)

- **Kogo dotyczy:** każdego zalogowanego użytkownika panelu; gości nie.
- **Co się zmienia:** po wdrożeniu serwer nie rozpoznaje starego ciasteczka, więc wszyscy są wylogowani.
- **Co zrobić:** uprzedzić restauracje o ponownym logowaniu; operator nic nie zmienia w `.env`.
- **Wycofanie:** poprzedni obraz (docs/DEPLOYMENT.md §10, ścieżka A); sesje z nowej wersji znów wygasają.
```

## [Unreleased]

### W produkcji serwer nie startuje bez poprawnego `PUBLIC_BASE_URL` (#120)

- **Kogo dotyczy:** operatora każdej instalacji z `NODE_ENV=production` (`npm start`, obraz Docker), niezależnie od `DATA_SOURCE`.
- **Co się zmienia:** brak `PUBLIC_BASE_URL`, adres `http://`, IP, host jednoczłonowy albo nazwa lokalna (`.localhost`, `.local`, `.internal`, `.lan`, `.home.arpa`) zatrzymuje start z kodem 1; wcześniej serwer startował, a kody QR wskazywały zły adres.
- **Co zrobić:** przed aktualizacją ustawić w `.env` publiczny adres `https://` tej instalacji (`.env.example`, docs/DEPLOYMENT.md §4). Tylko do uruchomienia lokalnego lub testu: `ALLOW_LOCAL_BASE_URL=true` (start loguje ostrzeżenie).
- **Wycofanie:** poprzedni obraz (docs/DEPLOYMENT.md §10, ścieżka A); schemat bazy bez zmian. Nie drukuj kodów QR, dopóki adres nie jest docelowy.
