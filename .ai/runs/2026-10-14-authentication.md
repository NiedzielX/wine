---
started: 2026-10-14
ended: 2026-10-14
agent: Claude (claude.ai, claude-opus-5-5)
spec: .ai/specs/2026-10-14-phase4-authentication.md
outcome: success
related: [.ai/runs/2026-10-14-sommelier-writes.md]
---

# Migracja — Faza 4: uwierzytelnianie, role, REST API zapisu

## Zadanie
Polecenie właściciela: „kontynuuj”. Pierwsza nieukończona faza planu: Faza 4.

## Przebieg
1. Przeczytano plan i lekcje; stan bazowy zielony (Faza 3). Zapisano specyfikację z decyzjami (scrypt, sesje z hashem tokenu w bazie, blokada, role wg `USER_ROLES.md`, CSRF, REST zapisu).
2. `core`: typy, `permissions.ts`, `AuthService`, porty, konta demo (hasze scrypt wygenerowane tym samym hasherem), magazyn w pamięci, `Actor` w komendach (testy zaktualizowane), kontrakt `AuthRepository`, `listPairings`.
3. `db`: encje `User` / `Membership` / `Session`, `actor_id`, `PgAuthRepository` (licznik prób jednym `UPDATE … RETURNING`), hasher i tokeny pod `@wine-match/db/auth`, seeder, `user:create`, migracja (SQL przejrzany), baza deweloperska odtworzona od zera.
4. `app`: kontener, `server/auth.ts`, logowanie, layout, akcje z uprawnieniami, UI zależne od roli, REST API zapisu (`handle()`), nagłówki, `proxy.ts`.
5. Błędy i ślepe uliczki:
   - **Realny błąd: 500 w API przy każdym błędzie domenowym.** Dwie nałożone przyczyny: dwie kopie `core` w bundlach Next.js (`instanceof` zawodzi) oraz zminifikowane nazwy klas w buildzie produkcyjnym (moje pierwsze obejście po `name` też zawiodło). Naprawa: literalne `name` + `domainError()`; reguła w `check:boundaries` (sprawdzona wstrzyknięciem naruszenia). Lekcja zapisana.
   - **Realna luka UX:** powrót po logowaniu kierował na dashboard zamiast na żądaną stronę (layout nie zna ścieżki) — `proxy.ts`.
   - Smoke zakładał, że pairing Savigny jest propozycją silnika; to pairing ręczny, więc `DELETE` go usunął. Błąd testu (dane przywrócone przez reseed), nie aplikacji.
   - Surowy POST z Playwrighta do akcji serwerowej daje 500 nawet dla legalnej akcji i dla anonima — nic nie dowodzi. Obrona serwera potwierdzona dopiero formularzami wysłanymi natywnie z przeglądarki, z próbą kontrolną uprawnionego konta.
   - Błędy środowiska testowego: brak `DATABASE_URL` przy starcie serwera (500 „No database specified”), selektor `[role=alert]` łapiący element Next.js, kolizja nazw `list` w skrypcie, przecinek w `next.config.ts`, dwukropek w nazwie kroku YAML (wyłapany walidacją pliku CI).

## Weryfikacja
- `npm run typecheck` OK; `npm test` — 122 (core) + 7 (db); `npm run test:db` — 31 na PostgreSQL 16; `schema:check` zgodny; `npm run build` OK z granicami pakietów.
- `npm run smoke`: `memory` 111/111, `postgres` 111/111.
- Playwright na PostgreSQL: pełen przepływ logowania i uprawnień (szczegóły w specyfikacji); `Secure` domyślnie w produkcji sprawdzone nagłówkiem; `user:create` (słabe hasło, zła rola, nieznana restauracja, duplikat, logowanie nowego konta).

## Wynik
Faza 4 zakończona (AC1–AC7). Następna: Faza 5 (import menu i karty win po stronie serwera, QR, ekran Setup). Dług: limit prób per konto; brak resetu hasła, 2FA i UI użytkowników; CI nieuruchomione; edycja dania i wina nie jest w żadnej fazie.

## Lekcje
- `.ai/lessons/2026-10-14-nextjs-duplicate-module-instanceof.md` (awans do `packages/app/AGENTS.md` i `check-boundaries`)
- `.ai/lessons/2026-10-14-auth-conventions.md` (awans do `AGENTS.md` §1.3)
