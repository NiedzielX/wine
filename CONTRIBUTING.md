# Jak wnosić zmiany

Ten plik tylko wskazuje źródła; zasady są w jednym miejscu każda.

- **Zasady pracy, architektura, specyfikacje, testy:** [AGENTS.md](AGENTS.md) (obowiązuje ludzi i agentów AI). Zmiana wymagająca specyfikacji zaczyna się od specyfikacji w `.ai/specs/`.
- **Proces od zgłoszenia do scalonego PR-a, etykiety ryzyka, bramki:** [SDLC.md](SDLC.md).
- **Na co patrzy recenzent:** [CODE_REVIEW.md](CODE_REVIEW.md) i [.ai/docs/review-protocol.md](.ai/docs/review-protocol.md).
- **Kontrakty, których nie wolno łamać:** [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md). Zmiana łamiąca dopisuje w tym samym PR-ze wpis w [UPGRADE_NOTES.md](UPGRADE_NOTES.md) (§9 kontraktu).
- **Wpisy w changelogu:** zmiana widoczna dla gościa, restauracji, operatora lub integratora API ma wpis w `## [Unreleased]` pliku [CHANGELOG.md](CHANGELOG.md) (przy wydaniu brakujące uzupełnia się z listy scalonych PR-ów).
- **Wydanie wersji (tag, notatki, GitHub Release, okno obserwacji, poprawka pilna):** [docs/RELEASING.md](docs/RELEASING.md); decyduje właściciel.
- **Polecenia i uruchomienie:** [README.md](README.md), [.ai/docs/commands.md](.ai/docs/commands.md). Przed PR: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run secrets:scan`.
- **Zgłaszanie luk bezpieczeństwa:** [security-notes.md](security-notes.md) i [docs/security/threat-model.md](docs/security/threat-model.md); osobnej polityki zgłoszeń jeszcze nie ma (decyzja właściciela).
- **Licencja:** nie została wybrana (decyzja właściciela); do tego czasu repozytorium nie jest udostępnione na licencji open source.
