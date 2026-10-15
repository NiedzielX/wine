---
date: 2026-10-14
updated:
area: process
status: active
source: .ai/runs/2026-10-14-authentication.md
promoted: AGENTS.md §1.3
---

# Uwierzytelnianie: jedno miejsce uprawnień, sprawdzanie przy każdych drzwiach, test przez prawdziwą przeglądarkę

## Reguły
- **Uprawnienia w jednej tabeli** (`core/src/auth/permissions.ts`, `can()` / `authorize()`); UI, akcje serwerowe i API pytają tylko ją. Ukrycie przycisku nie jest zabezpieczeniem.
- **Trzy drzwi, każde sprawdza sesję i uprawnienie samo:** layout panelu (`requireAccess`), akcje serwerowe (`authorizeAction`), route handlery (`handle()` w `server/api-auth.ts`). Layout nie chroni bezpośrednio wysłanego formularza ani żądania do API.
- **Jedna odpowiedź** na zły login, nieznane konto i zablokowane konto; dla nieznanego konta weryfikuj hasło względem `dummyHash` (równy czas).
- **Sesja:** losowy token, w bazie tylko SHA-256; hasła scrypt z parametrami w hashu; blokada atomowym `UPDATE … RETURNING` (równoległe próby się nie gubią).
- **Dane demo mają publiczne hasło** (`DEMO_PASSWORD`): seeder i konta demo nigdy na produkcję; prawdziwe konta przez `npm run user:create` (hasło z `USER_PASSWORD`, nie z linii poleceń).
- **Powrót po logowaniu:** layout nie zna ścieżki — `src/proxy.ts` przekazuje ją w nagłówku `x-pathname`; zawsze przez `safeNext()` (tylko `/admin/...`, bez open redirect).
- **Nowy układ po akcji:** `revalidatePath(..., 'layout')` (lekcja `server-action-layout-revalidate`).

## Jak testować obronę serwera
Surowy POST z Playwrighta do akcji serwerowej **nie jest przyjmowany** przez Next.js (500 nawet dla legalnej akcji), więc nic nie dowodzi o autoryzacji. Wysyłaj sfałszowany formularz **przez przeglądarkę**: wstrzyknij do strony zalogowanego użytkownika `<form method=POST enctype=multipart/form-data>` z polem `$ACTION_ID_<id>` (id z HTML strony sommeliera) i wyślij natywnie. Zawsze dodaj próbę kontrolną z uprawnionym kontem, żeby technika była wiarygodna.

## Środowisko testowe
Serwer uruchamiaj z `DATABASE_URL` (lokalny `.env` w katalogu głównym — jest w `.gitignore`); brak zmiennej daje 500 „No database specified”, który wygląda jak błąd aplikacji.
