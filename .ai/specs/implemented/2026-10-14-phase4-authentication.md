---
status: implemented
created: 2026-10-14
owner: Filip
related: [.ai/specs/2026-10-14-mockups-to-app-migration-plan.md, .ai/specs/implemented/2026-10-14-phase3-sommelier-writes.md, .ai/runs/2026-10-14-authentication.md]
superseded_by:
---

# Faza 4 — uwierzytelnianie, role i REST API zapisu

> Zakres z planu migracji; decyzje poniżej podjął agent według `AGENTS.md` i OWASP (polecenie właściciela: „kontynuuj, decyzje samodzielnie”). Do przeglądu.

## Problem
Panel jest otwarty dla każdego, kto zna adres; zapisy chroni tylko flaga środowiskowa, a historia decyzji pokazuje Wine Directora zamiast osoby, która wykonała zmianę. Brak ról: GM nie powinien zatwierdzać pairingów.

## Cel i zakres
Logowanie i sesje, role z macierzy `docs/USER_ROLES.md`, ochrona całego panelu i zapisów (strony, akcje, API), REST API zapisu, prawdziwy autor w historii decyzji, usunięcie `ADMIN_WRITES_ENABLED`.
**Poza zakresem:** reset hasła e-mailem, 2FA, SSO, zarządzanie użytkownikami w UI (jest polecenie CLI), klucze API dla integracji, rola System Administrator.

## Decyzje
| Temat | Decyzja | Uzasadnienie |
|---|---|---|
| Dostawca | Własne, minimalne uwierzytelnianie w `core` + `db` (bez nowych zależności) | stos offline, brak zewnętrznego IdP; zakres wąski |
| Hasła | scrypt (N=32768, r=8, p=1, sól 16 B) z `node:crypto`, porównanie `timingSafeEqual`; minimum 12 znaków przy tworzeniu konta | OWASP dopuszcza scrypt; brak natywnych zależności |
| Sesje | losowy token 32 B, w bazie tylko hash SHA-256; cookie `wm_session`: httpOnly, SameSite=Lax, Secure w produkcji (`AUTH_COOKIE_SECURE` do wymuszenia), ważność 12 h; nowy token przy każdym logowaniu; wylogowanie usuwa sesję w bazie | wyciek bazy nie ujawnia sesji; ochrona przed fiksacją |
| Blokada | 5 nieudanych prób → konto zablokowane na 15 min (atomowy licznik w SQL); jeden, ogólny komunikat błędu; weryfikacja „na ślepo” dla nieznanego e-maila (wyrównanie czasu) | nie ujawnia, czy konto istnieje |
| Role | owner, manager (obie jak „Owner / GM”), sommelier, waiter. Uprawnienia w `core/auth/permissions.ts`: GM i Owner: panel, dostępność win, publikacja, ustawienia; **tylko Sommelier: decyzje o pairingach**; waiter: brak logowania do panelu (widok kelnera `/r/{slug}/staff` zostaje publiczny) | macierz z `USER_ROLES.md` |
| Egzekwowanie | w jednym miejscu: `requireAccess(slug, permission)` w layoucie panelu, akcjach serwerowych i route handlerach; UI ukrywa niedozwolone kontrolki, ale nie jest zabezpieczeniem | nigdy nie ufać UI |
| Autor | `Actor { id, name }` w komendach; `SommelierDecision.actor_id` | rozliczalność |
| CSRF | akcje serwerowe: wbudowana kontrola Origin; REST: nagłówek `X-CSRF-Token` (token sesji, zwracany przez `/auth/me`) + odrzucenie `Sec-Fetch-Site: cross-site` | spec API wymaga CSRF |
| Nagłówki | `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Cache-Control: no-store` dla `/admin` i `/api/v1/auth` | clickjacking, cache |
| REST zapisu | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /restaurants/{slug}/pairings`, `PATCH /pairings/{id}`, `POST /pairings`, `DELETE /pairings/{id}`, `POST /restaurants/{slug}/pairings/bulk-decision`, `PATCH /wines/{id}`, `POST /restaurants/{slug}/publish`; **jedna zmiana na żądanie** w `PATCH` (status albo rola albo notatka); `If-Match` = wersja. Odłożone: `PUT /dishes/{id}/pairings/order`, `/pairings/generate`, klucze API | cienkie nakładki na te same serwisy |
| Adresowanie restauracji w API | po `slug` (nie UUID), spójnie z API publicznym | slug jest unikalny i stały |
| Konta demo | tylko w danych demo (`marta@halka.pl` sommelier, `tomasz@halka.pl` GM, `kelner@halka.pl` waiter; hasło `demo-halka-2026`); prawdziwe konta: `npm run user:create` | seeder nie jest produkcyjny |

## Wymagania
- R1 `core`: porty `AuthRepository`, `PasswordHasher`, `SessionTokens`; `AuthService` (login, authenticate, logout, blokada); `permissions.ts`; komendy z `Actor`; magazyn w pamięci z kontraktem.
- R2 `db`: encje `User` (`app_user`), `Membership`, `Session`; kolumna `actor_id` w historii; repozytoria; hasher i tokeny (`@wine-match/db/auth`); seeder kont demo; polecenie `user:create`; migracja.
- R3 `app`: logowanie i wylogowanie; ochrona panelu, akcji i API; UI zależne od roli; REST API zapisu; nagłówki; usunięcie `ADMIN_WRITES_ENABLED`.

## Kryteria akceptacji
- [x] AC1 Testy `AuthService` (poprawne logowanie, złe hasło, blokada po 5 próbach i odblokowanie po czasie, wygaśnięcie sesji, wylogowanie, nieznany e-mail) i kontrakt `AuthRepository` przechodzą na pamięci i PostgreSQL.
- [x] AC2 Żaden adres `/admin/**` ani endpoint zapisu nie działa bez sesji (307 na logowanie / 401); brak członkostwa w restauracji = 403; testy w smoke.
- [x] AC3 GM nie może zatwierdzać pairingów (UI i API 403), może publikować; waiter nie loguje się do panelu.
- [x] AC4 W bazie jest tylko hash tokenu sesji i hash hasła; cookie ma flagi httpOnly i SameSite.
- [x] AC5 Historia decyzji zawiera zalogowanego użytkownika (`actor`, `actor_id`).
- [x] AC6 API: brak tokenu CSRF = 403, cross-site = 403, konflikt wersji `If-Match` = 409/412.
- [x] AC7 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone; granice pakietów zachowane.

## Projekt rozwiązania
`core`: `auth/{types,permissions,auth-service}.ts`, rozszerzone porty, magazyn w pamięci. `db`: encje, repozytoria, `src/auth` (scrypt, tokeny), migracja, skrypt `create-user`. `app`: `server/auth.ts` (sesja z cookie, `requireAccess`), `/admin/login`, akcje, layout, REST (`/api/v1/auth/*`, zapisy), `next.config` (nagłówki).

## Ryzyka i otwarte pytania
- Hasło demo jest publiczne: seeder i konta demo nie mogą trafić na produkcję (dokumentacja + brak seedera w skryptach produkcyjnych).
- Limit prób jest per konto, nie per adres IP; limit per IP wymaga współdzielonego magazynu (Redis) — poza zakresem.
- Czas życia sesji bezwzględny (12 h), bez odświeżania.

## Realizacja
- Log: `.ai/runs/2026-10-14-authentication.md`; lekcje: `nextjs-duplicate-module-instanceof`, `auth-conventions`.
- **`core`:** `auth/` (typy, `permissions.ts`, `AuthService`), porty `AuthRepository` / `PasswordHasher` / `SessionTokens`, konta demo, magazyn w pamięci, `Actor` w komendach, kontrakt `AuthRepository`; 122 testy.
- **`db`:** `User` / `Membership` / `Session`, `actor_id`, repozytorium z atomowym licznikiem prób, `@wine-match/db/auth` (scrypt, tokeny), seeder kont demo, `npm run user:create`, migracja `accounts_and_sessions`; 7 testów jednostkowych i 31 integracyjnych.
- **`app`:** logowanie / wylogowanie, `requireAccess` / `authorizeAction` / `handle()`, `proxy.ts` (powrót na żądaną stronę), UI zależne od roli, REST API zapisu, nagłówki bezpieczeństwa, `domainError()`.
- **Odstępstwa od specyfikacji:** (1) `PUT /dishes/{id}/pairings/order` i `/pairings/generate` pozostają odłożone (w specyfikacji tak było); (2) dodano `proxy.ts` i regułę w `check:boundaries` (nie było w projekcie).
- **Błędy znalezione weryfikacją:** (1) API zwracało 500 dla błędów domenowych (dwie kopie modułu + zminifikowane nazwy klas) — `domainError()` po literalnym `name` i `code`, reguła w `check:boundaries`; (2) po logowaniu użytkownik wracał na dashboard zamiast na żądaną stronę — `proxy.ts`; (3) smoke zakładał, że pairing Savigny to propozycja silnika (jest ręczny), więc `DELETE` go usunął — test poprawiony, dane przywrócone; (4) `next.config.ts` bez przecinka (build).
- **Weryfikacja:** typecheck; 122 + 7 testów jednostkowych; 31 integracyjnych na PostgreSQL (ten sam kontrakt zapisu i uwierzytelniania co w pamięci); `schema:check`; `build` z granicami; `npm run smoke` 111/111 w `memory` i `postgres`; w przeglądarce na PostgreSQL: logowanie, powrót na żądaną stronę, flagi cookie, hash tokenu w bazie, blokada konta, autor w historii, GM view-only, **sfałszowane formularze decyzji z konta GM i anonimowe odrzucone przez akcje serwerowe** (z próbą kontrolną), kelner bez dostępu, wylogowanie, wygaśnięcie sesji, logowanie bez JS; `Secure` w produkcji domyślnie; `user:create`.
