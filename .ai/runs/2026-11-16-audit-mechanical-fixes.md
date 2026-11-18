---
started: 2026-11-16 09:00
ended: 2026-11-16 10:45
agent: Claude Code
spec: brak — drobne poprawki
outcome: success
related: [.ai/maintenance/2026-11-15-audit.md]
---

# Mechaniczne poprawki z audytu wiedzy 2026-11-15

## Zadanie
Zastosować wyłącznie pozycje oznaczone w audycie jako „bezpieczne, mechaniczne”; każde ustalenie sprawdzić w repozytorium przed poprawką.

## Przebieg
- Worktree `/home/user/wine-fixes`, gałąź `docs/audit-mechanical-fixes` z `origin/main` (`bbe519b`).
- `.ai/qa/INDEX.md:95-103`: usunięte podwójne `.md.md` w 9 linkach (pliki w `.ai/qa/security/` istnieją).
- Linki do specyfikacji przeniesionych do `implemented/`: `implemented/2026-10-15-guest-usage-events.md:23` (kpi-dashboard), `docs/SCREEN_SPECIFICATION.md:98` (guest-short-path-and-desktop), `product-completion-plan.md:36` (recommendation-code). Wszystkie trzy pliki docelowe sprawdzone `ls`.
- `.ai/qa/README.md:77`: przykład `example.e2e.test.ts` -> `access-boundaries.e2e.test.ts` (plik istnieje; link w szablonie liczony od `.ai/qa/{AREA}/`).
- `.ai/docs/commands.md`: dopisane `check:design` (`package.json:45`, CI `ci.yml:102`) i `storybook` / `storybook:build` (`package.json:23-24`).
- `AGENTS.md` §1.2: dopisany `testkit`; §1.4: trzeci layout `(showcase)` (`packages/app/src/app/(showcase)/layout.tsx`).
- `.ai/lessons.md`: skrócone linie 7 awansowanych lekcji (18, 23, 42, 58, 67, 68, 69); pozostałe 8 były już minimalne.
- `docs/PROCESS.md:58,173,182` i `.ai/docs/process-playbook.md:60`: granice dostępu części 2–3 wdrożone w #146 (`dc5068a`); po #150 nadal nieaktualne.
- `.ai/docs/process-templates.md`: drzewo `.ai/` uzupełnione o katalogi `docs`, `qa`, `maintenance`, `skills`, `trackers`, `browsers`, `scripts`, `schemas`, `analysis` (C-16).
- Pominięte: C-13 (audyt się myli: `scripts/` w specyfikacji jest względne do `packages/db`, pliki istnieją w `packages/db/scripts/`), C-14 (`.claude/commands/` wymaga decyzji/zmiany w `.claude/`), S-06/S-08 i `staff-accounts-and-roles` (edycja treści specyfikacji), limit per IP (patrz Wynik).

## Weryfikacja
- `npx -y npm@11.20.0 install --engine-strict=false`: OK.
- `npm run check:context`: 0 błędów, 9 ostrzeżeń (wszystkie CTX-08, specyfikacje >40 KB, jak przed zmianą). Zapas `AGENTS.md` 1110 B do ostrzeżenia (przed: 1193 B; koszt dopisków 83 B), `.ai/lessons.md` 373 B (przed: 185 B).
- `npm run audit:process`: PASS 48, FAIL 4 (TEST-05, TEST-06, REL-04, PROD-02: istniejące, bez związku ze zmianą), PARTIAL 1, MANUAL 10; brak nowych FAIL.
- `npm run lint`: czysto. `npm run secrets:scan`: 21 trafień, wszystkie na allowliście. `npm test -w @wine-match/testkit`: 675 passed, 1 skipped.
- Skan względnych linków Markdown (poza `runs/`, `maintenance/`): po zmianach brak martwych linków poza placeholderami szablonów.

## Wynik
Wszystkie zakresowe poprawki zastosowane. Uwaga dla właściciela: audyt (S-03, tabela C) mówi, że limit per IP jest otwarty, ale #148 (`f34ad08`) go wdrożył, a #152 dodał test odporności API; teksty o tym w `docs/PROCESS.md` (§3, §6) i `process-playbook.md:61-64` są nieaktualne, nie ruszone (poza zakresem).

## Lekcje
brak
