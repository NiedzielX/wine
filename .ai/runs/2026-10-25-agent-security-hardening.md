---
started: 2026-10-25 11:30
ended: 2026-10-25 13:40
agent: Claude Code
spec: .ai/specs/2026-10-25-agent-security-hardening.md
outcome: partial
related: [.ai/runs/2026-10-25-pos-item-name-privacy.md]
---

# Utwardzenie warsztatu agenta AI (lekcja 9): `deny`, hook, skan sekretów, CODEOWNERS, security-notes

## Zadanie
Plan z lekcji 9 zatwierdzony przez właściciela w czacie (bramki G0–G5): audyt, specyfikacja, wdrożenie, test prompt injection. Spec: `.ai/specs/2026-10-25-agent-security-hardening.md`.

## Przebieg
- Audyt tylko do odczytu: brak `.claude/settings.json`, `.mcp.json` i hooków; 42 skille z `open-mercato/skills` z hashami w locku, bez dynamicznego kontekstu; brak realnych sekretów (16 trafień wzorca przed allowlistą, wszystkie testowe); CI z `contents: read`; ochrona `main` z 5 checkami, `strict`, `enforce_admins`, 0 wymaganych approvals; szerokie testy uprawnień. Luki: brak `deny`/sandboxa/hooka, wąski `.gitignore`, brak skanu sekretów i `CODEOWNERS`.
- Specyfikacja i niezależny przegląd pod-agentem (świeży kontekst, tylko odczyt). Przyjęto: hook w Node zamiast `bash` + `jq`, tokenizacja komend, allowlista z hashem, tryb `--root` skanera, kompletniejsza lista `excludedCommands`; odrzucono `Edit` w `deny` dla `.claude/`.
- Dwie decyzje odbiegające od planu zatwierdzonego w czacie, podjęte z powodów bezpieczeństwa:
  1. **Sandbox jest gotowy, ale `enabled: false`.** Sesje chmurowe tego projektu wysyłają HTTPS przez lokalny proxy `127.0.0.1`, a na Linuksie `localhost` w sandboxie jest prywatny; w środowisku nie ma `bubblewrap` ani `socat`, więc nie dało się sprawdzić, że włączenie go nie odetnie `git`, `gh` i `npm`.
  2. **„Require review from Code Owners” nie zostało włączone.** Repo ma jednego opiekuna, a autor PR nie może zatwierdzić własnej zmiany, więc przy `enforce_admins` zablokowałoby to każdy merge. `CODEOWNERS` jest jako oznaczenie.
- Jeden PR zamiast dwóch: test `agent-guardrails` czyta `security-notes.md`, a `AGENTS.md` §9 odwołuje się do obu części.
- Test prompt injection: trzy ładunki w katalogu poza repo, każdy wykonany przez osobnego pod-agenta w świeżym kontekście. Wynik 3 z 3 odparte, plik kontrolny nie powstał (szczegóły w `security-notes.md`, §7).
- `.claude/settings.json` powstał w osobnym worktree (`/home/user/wine-hardening`), żeby nie załadował się do sesji, która go pisze.
- Liczba trafień skanera przed allowlistą: 16 (15 connection stringów z hasłem-przykładem, 1 sztuczny JWT w teście redakcji logów), 13 unikalnych wpisów w allowliście.

## Weryfikacja
- Testy najpierw: `agent-guardrails.test.ts` padał (brak pliku ustawień i hooka), potem 77 przypadków zielonych (zablokowane, przepuszczone, błędne wejście, ustawienia, `.gitignore`) plus 2 testy `security-notes.md`; `secret-scan.test.ts` 11 przypadków.
- `npm run lint`: zielone. `npm run typecheck`: zielone (po poprawce typu w teście). `npm test`: 565 + 49 + 62 + 353 + 100 testów, bez błędów. `npm run secrets:scan`: kod 0 (16 trafień, wszystkie na allowliście). `npm run check:boundaries`: zielone. `npm run build`: zielone.
- Ręcznie: hook na dodatkowych komendach (`cat .env | head`, `echo "$(cat .env)"`, `xargs rm -rf`, `find … | xargs rm -rf`, `cd /tmp && rm -rf x` blokowane; `npm run test:db`, odczyt fixture CSV przepuszczone).
- Nie sprawdzono w żywym Claude Code: działania `permissions.deny`, hooka podpiętego przez `settings.json` i sandboxa (brak interaktywnego agenta i `bubblewrap`). Strukturę ustawień sprawdza test, a klucze pochodzą z dokumentacji (sandboxing, permissions).
- `test:db` pominięty (brak zmian w `db`, portach i serwisach).

## Wynik
Gotowe w PR: R1–R9. Po stronie właściciela zostają: R10 (dodanie `secrets` do wymaganych checków po pierwszym przebiegu na `main`), AC5 (`gh api repos/NiedzielX/wine/codeowners/errors` po wypchnięciu), włączenie i test sandboxa lokalnie, skan `~/.claude/projects/` na jego komputerze i rotacja, przeczytanie skilli i weryfikacja hashy z `skills-lock.json`. Status specyfikacji zostaje `in-progress` do zakończenia R10 i AC5.

## Lekcje
`.ai/lessons/2026-10-25-agent-config-in-repo.md`.
