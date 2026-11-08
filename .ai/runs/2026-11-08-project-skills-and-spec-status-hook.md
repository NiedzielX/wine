---
started: 2026-11-08 14:00
ended: 2026-11-08 17:00
agent: Claude Code / claude-sonnet-5-5 (pod-agent)
spec: brak (narzędzia agenta, bez zmiany zachowania aplikacji)
outcome: success (PR #132 otwarty przez koordynatora; poprawki po review naniesione, czeka na przegląd właściciela)
related: [.ai/runs/2026-11-07-check-routes.md]
---

# Trzy skille projektu Wine Match i drugi hook (`spec-status-guard`)

## Zadanie
Audyt projektu końcowego: (a) co najmniej jeden skill dopasowany do projektu, (b) drugi hook chroniący regułę projektu (`AGENTS.md` §3: `status: approved` tylko człowiek). Jedna gałąź; push i PR zrobił koordynator (#132).

## Przebieg
- Hook, test najpierw (`packages/testkit/tests/spec-status-guard.test.ts`): 86 z 87 przypadków czerwonych (brak pliku hooka); po `.claude/hooks/spec-status-guard.mjs` 85 zielonych i 2 czerwone (okablowanie, notatka); po `settings.json` i `security-notes.md` wszystkie zielone. `agent-guardrails.test.ts`: szuka wpisu `Bash` (był „dokładnie jeden wpis PreToolUse”).
- Skille: `.claude/skills/wine-match-engine-rule`, `wine-match-access-boundary-test`, `wine-match-new-api-route` jako prawdziwe katalogi. Każda ścieżka w odwrotnych apostrofach sprawdzona skryptem (`-e`); brakują tylko placeholdery `NNN` i `YYYY`.
- `skills-lock.json` zawiera tylko skille z `open-mercato/skills`; nic w repo go nie weryfikuje (grep w `scripts/`, `.github/`, `package.json`: 0 trafień poza CODEOWNERS), więc skille lokalne nie trafiają do locka (`security-notes.md` §3). `check:context` liczy je: 45 skilli.
- `AGENTS.md`: jeden wiersz routingu (+75 B, 24 587 B; ostrzeżenie o budżecie istniało wcześniej, limit błędu 27 648 B).
- **Ścieżki CODEOWNERS dotknięte zmianą:** `/.claude/`, `/security-notes.md`, `/AGENTS.md`, `/.ai/docs/` (`commands.md`). Wymagają przeglądu właściciela (NiedzielX); wymuszenie Code Owners jest wyłączone.
- Środowisko: w worktree nie było `node_modules`, `npm ci` odmówił (npm 10.9.9, wymagane ≥ 11.6), więc `node_modules` to dowiązanie do głównego checkoutu (ignorowane przez git).

### Poprawki po review PR #132 (red najpierw)
1. **Hook zawodził otwarcie na poprawnych formach YAML** (wcięty nagłówek, `{status: approved}`, `{title: x, status: approved}`, kotwica `&b` i alias `*b`, zagnieżdżony `status`, linia `[a, b]`). Dodałem 7 testów blokujących (czerwone: `Tests 9 failed | 95 passed`), potem `specStatus()` odmawia: linii zaczynającej się od `{` lub `[`, kotwicy lub aliasu, `status` w nawiasach, `status` z wcięciem. Kontrole dozwolone: zwykły nagłówek (z `related: [...]` i `R&D`), treść z klamrami i wciętą linią `status: approved` w prozie, lista blokowa w nagłówku, wszystkie prawdziwe nagłówki z `.ai/specs/` (test przechodzi po całym katalogu).
2. **Słabe testy:** (a) `replace_all` (nagłówek `title: draft` + `status: draft`, Edit i MultiEdit); (b) test `cwd` przepisany: specyfikacja istnieje tylko pod zgłoszonym `cwd`, edycja zachowująca `approved` musi być dozwolona (mutacja `resolve(cwd, file)` → `resolve(file)` teraz pada: 2 testy czerwone); mutacja pomijająca `replace_all` też pada (2 czerwone); (c) test `security-notes.md` sprawdza frazy z nowych akapitów („Znane luki spec-status-guard”, „formy nagłówka, które hook czyta”, „normalizacji cudzysłowów”).
3. **Wydajność:** `NEW_APPROVED` z `^\s*` było kwadratowe (200 tys. pustych linii: test czerwony po 27,5 s); teraz `^[ \t]*`, test: 200 tys. pustych linii w Edit i w Write poniżej 1 s.
4. **Wiszące dowiązanie:** `realPath()` idzie przez `lstat`/`readlink` także przy nieistniejącym celu (głębokość 8; potem ścieżka jak w wywołaniu). Testy: `other/dangling.md -> ../.ai/specs/ghost.md` blokowane, dowiązanie do `../docs/ghost.md` dozwolone.
5. Ten log (Weryfikacja poniżej), nagłówek bez „bez push i PR”, skill `wine-match-new-api-route`: „Spec is `approved` (set by a human) or `in-progress`”.
6. `security-notes.md` §2: zastrzeżenie, że zamknięcie zawodzące dotyczy form nagłówka, które hook czyta (lista); §4 „Znane luki spec-status-guard” (normalizacja cudzysłowów w Edit niezweryfikowana, pętla dowiązań > 8, nieznana forma YAML, dowiązanie wiszące tylko przy zapisie przez Write/Edit/MultiEdit).

### Druga runda review PR #132 (red najpierw)
- **Formy YAML czytane jako `approved`, a przepuszczane:** klucz złożony (`? status` + `: approved`), klucz z ucieczką (`"stat\x75s"`), wartość z ucieczką (`"\x61pproved"`), wartość w cudzysłowie złożona przez dwie linie (podwójnym i pojedynczym). 6 testów blokujących czerwonych (`6 failed | 108 passed`), potem `specStatus()` odmawia: linii od `?` lub `:`, klucza w `"..."` z ukośnikiem, wartości `status` w cudzysłowie niezamkniętej w linii lub (w podwójnym) z ukośnikiem. Kontrole dozwolone zielone (zwykłe nagłówki, `title: "a \ b"`, przegląd prawdziwych nagłówków `.ai/specs/`).
- **CRLF:** `old_string` i `new_string` są normalizowane do `\n` jak treść pliku (wcześniej `old_string` z `\r\n` nie pasował i edycja była oceniana jako niedopasowana). Test czerwony: edycja treści szkicu CRLF cytująca w treści linię `status: approved` była błędnie blokowana; zielony po poprawce. Testy w obie strony: edycja zatwierdzająca w CRLF nadal blokowana, `approved` → `in-progress` i edycja treści przez dwie linie w CRLF dozwolone.
- **`...` jako koniec nagłówka:** nie przyjmowane, opisane w `security-notes.md` §4 (odmowa, luka użyteczności, nie bezpieczeństwa).
- `security-notes.md` §2 (lista odmawianych form) i §4 „Znane luki” zaktualizowane.
- Wynik: `npm run lint` 0 uwag; typecheck bez błędów; `npm test`: core 743, db 84, ui 62, app 500, testkit 367 zielone; `check:context` 0 błędów; `check:qa` 97 OK; `check:routes` OK; `secrets:scan` OK (po commicie).

## Weryfikacja (po poprawkach pierwszej rundy, 2026-11-08)
- `npm run lint`: 0 uwag. `npm run typecheck`: bez błędów.
- `npm test`: core 743, db 84, ui 62, app 500, testkit 356 zielone (w tym `spec-status-guard.test.ts` 104 i `agent-guardrails.test.ts`).
- `npm run check:context`: 0 błędów, 11 ostrzeżeń (istniejące). `npm run check:qa`: 97 scenariuszy OK. `npm run check:routes`: OK (25 handlerów, 21 tras). `npm run secrets:scan`: OK (21 trafień, wszystkie na allowliście).
- Mutacje na hooku (kopia zapasowa przywrócona, `cmp` zgodne): `resolve(file)` bez `cwd`: 2 testy czerwone; pominięcie `replace_all`: 2 czerwone; `\s*` zamiast `[ \t]*`: test wydajności czerwony (27,5 s).
- Nie uruchomione: `npm run build` (Turbopack odrzuca dowiązanie `node_modules` do głównego checkoutu: „points out of the filesystem root”; zmiana nie dotyka kodu aplikacji, CI buduje); `test:db`, `test:e2e`, `engine:matrix` (brak zmian w ich zakresie).

## Wynik
Hook i skille gotowe. Niezweryfikowane: czy Claude Code ładuje `.claude/skills/wine-match-*` automatycznie (bez restartu sesji nie dało się sprawdzić) i działanie hooka w żywej sesji (przetestowany jako polecenie z JSON na stdin, w tym ścieżki ze spacją i bez `argv[1]`). Znane luki: `security-notes.md` §4.

## Lekcje
`.ai/lessons/2026-11-08-project-skills-and-spec-status-hook.md`.
