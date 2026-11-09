---
started: 2026-11-09 14:48
ended: 2026-11-09 15:05
agent: Claude Code / claude-opus-5-5 (pod-agent, worktree)
spec: brak — porządkowanie plików procesu bez zmiany reguł (budżety ze specyfikacji 2026-10-25-context-engineering, R5, bez zmian)
outcome: success
related: [.ai/lessons/2026-10-25-context-budget-and-routing.md]
---

# Odchudzenie `AGENTS.md` i `.ai/lessons.md` pod budżety `check:context` bez utraty reguł

## Zadanie
`npm run check:context` ostrzega: `AGENTS.md` 24 927 B (> 23 552 B) i 251 linii (> 250); root + `packages/app/AGENTS.md` = 32 748 B (20 B pod limitem Codexa 32 768 B); `.ai/lessons.md` 16 152 B (błąd od 16 384 B, ostrzeżenie od 12 288 B). Cel: `AGENTS.md` ≤ ~22 KB i ≤ 250 linii, para z `app` z ≥ 2 KB zapasu, indeks lekcji ≤ ~12 KB. Bez utraty i osłabienia reguł, bez zmiany numeracji sekcji. Przy okazji: nieaktualne wersje w §1.1. Gałąź `chore/agent-context-slimming`, commit lokalny, bez push i PR. Plik procesu pod CODEOWNERS: risk-medium.

## Przebieg
- 14:48 Gałąź z `origin/main` (c4c9015). Przeczytane: `AGENTS.md`, `CLAUDE.md`, `.ai/lessons.md`, `scripts/check-context.mjs`, test `packages/testkit/tests/check-context.test.ts` (lista reguł-kotwic), `.ai/docs/architecture-rules.md`, `process-templates.md`, `fix-verification.md`, `parallel-work.md`.
- Stan wyjściowy `check:context`: 0 błędów, 13 ostrzeżeń (4 dotyczą tego zadania, 9 to rozmiary specyfikacji `2026-11-04-*`, poza zakresem).
- Wersje w `AGENTS.md` §1.1 porównane z `package.json` (root, `app`, `db`): nieaktualne były Next.js 16.4.1 → 16.4.3, React 19.3.0 → 19.3.1, MikroORM 7.2.2 → 7.2.5, Vitest 5.0.2 → 5.0.5 (TypeScript 7.0.2, Awilix 13.0.5, Tailwind 4.3.3, npm ≥ 11.6, Node ≥ 22.17 zgodne). `README.md`, `CONTRIBUTING.md`, `docs/`, `.ai/docs/`, pakietowe `AGENTS.md`: brak innych twierdzeń o wersjach (grep).
- `AGENTS.md`: uzasadnienia, przykłady i drzewa przeniesione do plików, które `AGENTS.md` już wskazuje; każda reguła normatywna została jednym zdaniem ze wskaźnikiem. Numery i nagłówki sekcji bez zmian (§1–§9, 1.1–1.6, 6.1 oraz nagłówki bez numeru). Mapa poniżej.
- `.ai/lessons.md`: linie skrócone do tytułu i jednej krótkiej reguły; pełna treść bez zmian w `.ai/lessons/`. Lekcje z `promoted:` mają linię minimalną ze wskazaniem sekcji. Poprawiona kolejność dwóch pierwszych linii (2026-11-09 nad 2026-11-08) i usunięta pusta linia w środku listy.
- Lekcja `2026-11-08-ci-supply-chain-pins` ma teraz `promoted: AGENTS.md §9` (reguła jest w §9 od 2026-11-08 i wskazuje tę lekcję; pole było puste). Lekcja `2026-11-05-on-request-error-carries-query-and-cookies` nie miała `status`; dodane `status: active`.
- `scripts/check-context.mjs`: nowa sekcja raportu „Headroom” (bajty do ostrzeżenia / błędu dla `AGENTS.md`, największego łańcucha Codexa i `.ai/lessons.md`, oraz linie `AGENTS.md`). Budżety bez zmian. Test w `packages/testkit/tests/check-context.test.ts` (wartości dodatnie i ujemna po przekroczeniu).

### Mapa przeniesionych fragmentów `AGENTS.md`

Zasada: reguła (MUSISZ / NIE WOLNO / „nie …”) zostaje w `AGENTS.md`; przenoszone są uzasadnienia, przykłady, drzewa i szczegóły, które już były albo teraz są w pliku docelowym.

| § | Usunięty lub skrócony fragment | Co zostało w `AGENTS.md` | Nowe / istniejące miejsce pełnej treści |
|---|---|---|---|
| 1.1 | wersje 16.4.1, 19.3.0, 7.2.2, 5.0.2 | 16.4.3, 19.3.1, 7.2.5, 5.0.5 | `package.json` (źródło prawdy) |
| 1.2 | drzewo `packages/` (blok kodu) | jedna linia z pakietami i kierunkiem zależności, wskaźnik | `.ai/docs/architecture-rules.md` §1.2 (drzewo było tam już dosłownie) |
| 1.2 | powtórzone drugie zdanie „Każdy pakiet ma własny `AGENTS.md` … przeczytaj go” | jedno wystąpienie (bez zmiany treści) | — (duplikat) |
| 1.3 | wyjątki od konwencji komend (telemetria, `RecommendationCodeService.issue`, polecenia operatora) ze szczegółami | lista wyjątków po nazwie + wskaźnik | `.ai/docs/architecture-rules.md` §1.3, punkt „Zapisy” (był tam pełny tekst, z `logger.warn`, Q7, G8) |
| 1.3 | wyjątek `restaurantId` dla `InvitationService.findUsable`/`accept` (2026-11-06) | nazwany w liście wyjątków + wskaźnik | `.ai/docs/architecture-rules.md` §1.3, punkt „Izolacja tenantów” (dopisany dosłownie; był też w `packages/core/AGENTS.md`) |
| 1.5 | lista przykładów poleceń (`smoke`, `boot:check`, `audit:gate`, `secrets:scan`, `check:context`) | „Wszystkie polecenia (testy, build, skrypty operatora, bramki)” + wskaźnik; reguła o bashizmach bez zmian | `.ai/docs/commands.md` (tabela) |
| 2 | drzewo `.ai/` (blok kodu) | jedna linia z katalogami i ich rolą | `.ai/docs/process-templates.md`, „Struktura `.ai/`” (dosłownie) |
| 2 | przykłady `import-csv-semicolon`, `2026-10-14-slug-2.md` | reguły formatu, daty, sluga, sufiksu `-2`, „plik niezgodny jest błędem” | — (przykłady; format pokazuje `2026-10-14-table-pairing-desserts.md`) |
| 3 | „Planowanie złożonych zadań”: trzy punkty z uzasadnieniem („w jednym podejściu”, „im dokładniejszy spec…”, „w roli doświadczonego inżyniera”) | jedno zdanie: plan w „Projekcie rozwiązania”, niejasności przed akceptacją, obowiązkowy niezależny przegląd z listą tematów | `.ai/docs/process-templates.md`, „Planowanie złożonych zadań” (dosłownie) |
| 3 | lista warunków wymagających specyfikacji jako wypunktowanie | te same cztery warunki w jednym zdaniu | — (forma) |
| 4 | trzy akapity | te same zdania w dwóch akapitach | — (forma) |
| 5 | „To pamięć długoterminowa projektu…” | — | nagłówek `.ai/lessons.md` („Indeks pamięci długoterminowej…”) |
| 5 | lista pięciu sytuacji „MUSISZ zapisać lekcję” jako wypunktowanie | te same pięć sytuacji w jednym zdaniu | — (forma) |
| 5 | „Celem jest malejąca liczba powtarzanych błędów” | reguła awansu i usuwania niepotrzebnych reguł | `.ai/docs/process-templates.md`, „Awans lekcji do zasad” |
| 6.1 | e2e: „skill `om-integration-tests` ma lokalne rozszerzenie w `.ai/skills/om-integration-tests/`… reguły w `references/best-practices.md`” | test deterministyczny w `tests/e2e/` + scenariusz `.ai/qa/{AREA}/` + `check:qa` + wskaźnik | `.ai/qa/README.md` (link do `.ai/skills/om-integration-tests/references/best-practices.md` był tam już) |
| 6.1 | „„Naprawione” to hipoteza”, „Mając zgłoszenie, padający test lub log” | reprodukcja, samodzielne dokończenie, `verify:regression` przed PR, wynik w PR | `.ai/docs/fix-verification.md` (wstęp, §3) i `process-templates.md`, „Najpierw działające…” |
| 6.1 | review: „pod-agent bez wglądu w uzasadnienia autora”, „GitHub nie pozwala autorowi zatwierdzić własnego PR-a” | inna sesja, bez kontekstu autora, najlepiej inny model, wynik jako komentarz do PR | `.ai/docs/fix-verification.md` §4 (było tam) |
| 6.1 | pytanie „wiedząc to, co wiem teraz…” | doraźna poprawka → eleganckie rozwiązanie w zakresie, inaczej dług w „Wyniku” | `.ai/docs/process-templates.md`, „Najpierw działające, potem właściwe” (dosłownie) |
| 7 | układ testów `db/tests` (`*.test.ts`/`*.integration.test.ts`), `app/tests/unit`, `app/tests/e2e` | wykluczenia jawne, testy w `tests/` pakietu, przykład `*.integration.test.ts` z bazą + wskaźnik | `.ai/docs/commands.md`, „Testy” (pełny układ był tam) |
| 8 | „Kiedy pod-agent, kiedy nie” (koszt tokenów, pusty kontekst) | połączone z punktem „Pod-agentów…”: do czego tak, „nie do małej zmiany w jednym pliku”, wymagany brief, scalanie w logu | `.ai/docs/process-templates.md`, „Kiedy pod-agent, kiedy nie” (dosłownie) |
| 9 | „wymuszenie Code Owners wraca, gdy repo będzie miało drugą osobę” | CODEOWNERS + zmiana przez PR z przeglądem | `security-notes.md` (wiersz `CODEOWNERS`: „wymuszenie wraca przy drugiej osobie”) |
| 9 | „`permissions.deny` blokuje narzędzia plikowe, a hook czyta tekst komendy, nie intencję” (powtórzone w ostatnim punktach) | jedno zdanie: `permissions.deny` i hook to dwie warstwy (guardrail), nie granica | `security-notes.md` (tabela warstw, „czyta tekst komendy, nie intencję”) |

Kontrola, że nic nie zginęło: zliczenie wyróżnień normatywnych (`**MUSISZ**` 6, `**NIE WOLNO**` 3, `**NIE importuje**`, `**NIE zapisuj**`, `**NIE używaj bashizmów**`, `**tylko człowiek**`, `**nie implementuj**`, `**zatrzymaj się i wróć do planowania**`, `**nie edytuj logów innych przebiegów**`, `**na początku**`, `**na górze**`, `**od razu**`, `**zaktualizuj ją**`, `**nie zmienia się**`, `**nie wychodzą**`) jest takie samo przed i po; jedyna różnica to duplikat „przeczytaj go przed zmianą w pakiecie” (2 → 1). Pełny diff wszystkich wyróżnień `**…**` przed/po: różnią się tylko etykiety punktów („Testy integracyjne (e2e)…” → „Testy e2e…”, „Review poprawki robi inna sesja:” bez dwukropka), połączony punkt „Kiedy pod-agent, kiedy nie” (treść normatywna w punkcie „Pod-agentów”) i duplikat „przeczytaj go…”. Test kotwic `check-context.test.ts` („keeps the rules that must not be lost…”) przechodzi.

### Decyzje: lekcje nieaktualne

Żadnej lekcji nie oznaczono `status: obsolete`: każda sprawdzona kandydatka nadal dotyczy kodu lub środowiska.

| Lekcja | Sprawdzenie | Decyzja |
|---|---|---|
| `2026-10-16-postgres-without-docker` | brak `embedded-postgres` w repo, ale lekcja dotyczy maszyny agenta bez Dockera (poza repo); `test:db` nadal wymaga Dockera lub `TEST_DATABASE_URL` | aktywna |
| `2026-10-14-single-file-build-for-sharing` | `packages/mockups` istnieje (Vite, `index.html`), wtyczka celowo `--no-save` | aktywna |
| `2026-10-17-e2e-without-javascript` | `agent-browser` w `packages/testkit/src/browser.ts`, `vitest.e2e.config.ts` | aktywna |
| `2026-10-14-import-drafter-keyword-order` | `PROTEIN_WORDS` w `packages/core/src/engine/drafts.ts` | aktywna |
| `2026-10-16-ssr-page-tests-with-prerender` | `prerender` w 5+ testach `packages/app/tests/unit/` | aktywna |
| `2026-10-15-nextjs-vary-header-overwritten` | komentarz w `packages/app/src/proxy.ts:28` opisuje to samo zachowanie Next.js 16 | aktywna |
| `2026-10-17-nextjs-headers-hide-router-prefetch` | `Next-Router-Prefetch` w `proxy.ts`, `server/prefetch.ts` | aktywna |
| `2026-10-14-nextjs-loading-streams-and-http-status` | `(admin)/admin/[slug]/(lists)/loading.tsx` istnieje | aktywna |
| `2026-10-18-script-only-ui-use-sync-external-store` | `useSyncExternalStore` w `dish-search.tsx`, `print-button.tsx` | aktywna |
| `2026-10-14-typescript-7-toolchain` | `useTypeScriptCli: true` w `packages/app/next.config.ts`, TypeScript 7.0.2 | aktywna (awansowana) |
| `2026-10-14-npm-11-for-vitest-5` | `engines.npm >=11.6.0`, Vitest 5.0.5 | aktywna (awansowana) |
| `2026-10-25-audit-gate-new-advisories` | `scripts/audit-gate.mjs` ma wyjątek z `expires: '2027-01-15'` i sprawdzenie wygaśnięcia | aktywna |
| `2026-10-14-sticky-bars-scroll-padding`, `server-action-layout-revalidate` | `scroll-padding` w `guest.css`; `revalidatePath` w akcjach | aktywne |

### Czego nie przeniesiono i dlaczego

- Tabela routingu, tabela stosu (§1.1), tabela cyklu życia specyfikacji (§3) i lista kroków §6: to reguły lub routing, które agent musi mieć w każdej sesji; skracanie ich dawałoby niewiele bajtów kosztem czytelności.
- Pełne punkty §1.3–§1.6, §6.1 „Minimum” i „Granice dostępu”, cały §7 i §9 (poza dwoma uzasadnieniami): niezmienniki, część jest kotwicą testu.
- Etykiety „Para sommeliera” / „Polecane do Twojego dania” (§7): treść niezmiennika, nie przykład.
- `packages/app/AGENTS.md` (7 821 B) bez zmian: cel osiągnięty skróceniem roota, a plik ma własny budżet i nie ostrzega.
- 9 ostrzeżeń o rozmiarze specyfikacji `2026-11-04-*`: poza zakresem (podział specyfikacji to osobne zadanie).

## Weryfikacja

- `npx -y npm@11.20.0 ci` (brak `node_modules` w worktree): 572 pakiety.
- `npx vitest run tests/check-context.test.ts` (testkit): 30 passed (w tym nowy test „prints the headroom…” i test kotwic).
- `npm run lint`: exit 0. `npm run typecheck`: exit 0.
- `npm test`: exit 0 (745 + 126 + 62 + 500 + 448 testów).
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (przed: 0 błędów, 13 ostrzeżeń; zniknęły 4: rozmiar i linie `AGENTS.md`, łańcuch Codexa `app`, rozmiar `.ai/lessons.md`; zostały tylko rozmiary specyfikacji `2026-11-04-*`).
- Headroom po zmianie (z nowego raportu): `AGENTS.md` 1 381 B do ostrzeżenia / 5 477 B do błędu, 49 / 79 linii; Codex root + `app` 728 B / 2 776 B; `.ai/lessons.md` 636 B / 4 732 B.
- `npm run check:qa`: 105 scenariuszy OK. `npm run check:routes`: OK (25 handlerów). `npm run secrets:scan`: tylko wpisy z allowlisty.

| Plik | Przed | Po |
|---|---|---|
| `AGENTS.md` | 24 927 B, 251 linii | 22 171 B, 201 linii |
| root + `packages/app/AGENTS.md` | 32 748 B (20 B zapasu) | 29 992 B (2 776 B zapasu) |
| `.ai/lessons.md` | 16 152 B (232 B zapasu do błędu) | 11 652 B (4 732 B zapasu) |
| `.ai/docs/process-templates.md` | 3 837 B | 6 363 B |
| `.ai/docs/architecture-rules.md` | 9 235 B | 9 597 B |

### Poprawki po review (#142, approve with nits)

1. `.ai/lessons.md`: przywrócona reguła jednym krótkim zdaniem przy liniach `promoted:` — granica dostępu (test odmowy bez dowodu niezmienionych danych i bez mutacji, która go czerwieni, nie dowodzi granicy), POSIX (`dash`: bez `{a,b}`, `${PIPESTATUS}`, `[[ ]]`), npm 11 (npm 10 nie instaluje Vitest 5), łańcuch dostaw CI (`persist-credentials: false`, skan historii sekretów).
2. `AGENTS.md` §6.1: przywrócony warunek „Mając zgłoszenie, padający test lub log, doprowadź naprawę do końca samodzielnie; pytaj tylko o decyzje dotyczące zakresu lub zachowania produktu”.
3. `AGENTS.md` §6.1: przywrócona nazwa lokalnego rozszerzenia skilla `om-integration-tests` ze ścieżką `.ai/skills/om-integration-tests/`.
4. `AGENTS.md` §1.3: daty zatwierdzenia przy nazwach wyjątków (2026-10-15, 2026-10-16; 2026-11-06), żeby odwołanie w `usage-events.ts` do §1.3 było oczywiste.
5. `.ai/docs/process-templates.md`: „bez zmiany treści” → treść przeniesiona z drobnymi zmianami łączników.

Po poprawkach: `AGENTS.md` 22 359 B, 201 linii; root + `app` 30 180 B (2 588 B zapasu do 32 768 B); `.ai/lessons.md` 11 915 B (4 469 B zapasu do błędu, 373 B do ostrzeżenia). `check:context`: 0 błędów, 9 ostrzeżeń (tylko specyfikacje `2026-11-04-*`); testy testkit 448 passed; `npm run lint` exit 0.

## Wynik

Budżety spełnione bez zmiany reguł i numeracji. Ryzyko: **risk-medium** — `AGENTS.md`, `scripts/` i proces są pod `.github/CODEOWNERS`; zmiana wymaga przeglądu właściciela przez PR (tu: tylko commit lokalny, bez push i PR, zgodnie z poleceniem). Dług: wersje w §1.1 rozjeżdżają się z `package.json` po każdym bumpie Dependabota; tanim strażnikiem byłoby sprawdzenie w `check:context` (tabela §1.1 vs `package.json`), niezrobione, bo wykracza poza zakres.

## Lekcje

Brak nowej lekcji (zadanie stosuje istniejącą `2026-10-25-context-budget-and-routing`).
