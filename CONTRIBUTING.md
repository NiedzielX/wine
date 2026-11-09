# Jak wnosić zmiany

Ten plik tylko wskazuje źródła; zasady są w jednym miejscu każda.

- **Zasady pracy, architektura, specyfikacje, testy:** [AGENTS.md](AGENTS.md) (obowiązuje ludzi i agentów AI). Zmiana wymagająca specyfikacji zaczyna się od specyfikacji w `.ai/specs/`.
- **Proces od zgłoszenia do scalonego PR-a, etykiety ryzyka, bramki:** [SDLC.md](SDLC.md).
- **Na co patrzy recenzent:** [CODE_REVIEW.md](CODE_REVIEW.md) i [.ai/docs/review-protocol.md](.ai/docs/review-protocol.md).
- **Kontrakty, których nie wolno łamać:** [BACKWARD_COMPATIBILITY.md](BACKWARD_COMPATIBILITY.md).
- **Polecenia i uruchomienie:** [README.md](README.md), [.ai/docs/commands.md](.ai/docs/commands.md). Przed PR: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run secrets:scan`.
- **Zgłaszanie luk bezpieczeństwa:** [security-notes.md](security-notes.md) i [docs/security/threat-model.md](docs/security/threat-model.md); osobnej polityki zgłoszeń jeszcze nie ma (decyzja właściciela).
- **Licencja:** nie została wybrana (decyzja właściciela); do tego czasu repozytorium nie jest udostępnione na licencji open source.
