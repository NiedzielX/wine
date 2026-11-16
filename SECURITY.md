# Polityka bezpieczeństwa / Security policy

PL poniżej, EN further down.

## Polski

### Jak zgłosić podatność

Użyj funkcji GitHub **„Report a vulnerability”**: w repozytorium `NiedzielX/wine` otwórz zakładkę **Security**, potem **Report a vulnerability**. Zgłoszenie jest prywatne i widzi je tylko właściciel repozytorium.

Nie zgłaszaj podatności jako publiczne zgłoszenie (issue), pull request, komentarz ani w dyskusji, dopóki nie zostanie naprawiona. Nie publikuj szczegółów luki ani działającego exploita.

### Co zgłaszać

Błędy w kodzie z tego repozytorium, które naruszają bezpieczeństwo, na przykład:

- dostęp do danych innej restauracji (naruszenie izolacji tenantów),
- ominięcie logowania, ról lub uprawnień, przejęcie sesji, nadużycie zaproszeń,
- podatności aplikacji web (CSRF, XSS, wstrzyknięcie, nieautoryzowany dostęp do tras API),
- wyciek sekretów lub danych osobowych w logach, odpowiedziach błędów albo w repozytorium,
- słabości łańcucha dostaw: zależności, workflow CI, obraz kontenera.

Przeczytaj najpierw [docs/security/threat-model.md](docs/security/threat-model.md): opisuje znane zagrożenia i ich status (naprawione, zaakceptowane). Zgłoszenie o zagrożeniu już tam zaakceptowanym jest nadal mile widziane, jeśli pokazuje większy skutek niż opisany.

### Co ma być w zgłoszeniu

- krótki opis problemu i jego skutek (co może zrobić atakujący),
- kroki odtworzenia (adres lub trasa, rola konta, przykładowe żądanie),
- wersja: skrót commita z `main`, na którym to sprawdzono, oraz tryb (`DATA_SOURCE=memory` lub `postgres`),
- ewentualna propozycja poprawki.

Nie dołączaj prawdziwych haseł, tokenów ani danych gości lub restauracji. Do testów używaj danych demo.

### Czego się spodziewać

Projekt ma jednego właściciela i nie gwarantuje czasu reakcji. Właściciel potwierdza otrzymanie zgłoszenia, ocenia je (czy jest podatnością, jak poważną i czy dotyczy kodu z tego repozytorium) i odpowiada w zgłoszeniu. Poprawka trafia do `main` jak każda zmiana (testy, przegląd), a po jej scaleniu można ujawnić szczegóły, po uzgodnieniu ze zgłaszającym.

### Zakres

- **W zakresie:** kod w tym repozytorium (aplikacja, pakiety, skrypty, workflow, obraz budowany z `Dockerfile`).
- **Poza zakresem:** dane i konfiguracja konkretnych restauracji lub instalacji, cudze wdrożenia, usługi i zależności osób trzecich (zgłoś je ich autorom; błąd w sposobie użycia zależności w naszym kodzie jest w zakresie), ataki wymagające dostępu do hosta lub do cudzych kont, inżynieria społeczna, testy obciążeniowe i odmowa usługi na cudzych instancjach.

Testując, nie uzyskuj dostępu do cudzych danych ponad to, co konieczne do pokazania problemu, i nie niszcz danych.

### Obsługiwane wersje

| Wersja | Obsługiwana |
|---|---|
| `main` | tak |
| inne gałęzie i tagi | nie |

Poprawki powstają wyłącznie na `main`.

## English

### How to report a vulnerability

Use GitHub's **"Report a vulnerability"**: in the `NiedzielX/wine` repository open the **Security** tab, then **Report a vulnerability**. The report is private and visible only to the repository owner.

Do not report a vulnerability as a public issue, pull request, comment or discussion until it is fixed. Do not publish details of the flaw or a working exploit.

### What to report

Security bugs in the code of this repository, for example:

- access to another restaurant's data (tenant isolation failure),
- bypass of login, roles or permissions, session takeover, invitation abuse,
- web application flaws (CSRF, XSS, injection, unauthorised access to API routes),
- leaks of secrets or personal data in logs, error responses or the repository,
- supply-chain weaknesses: dependencies, CI workflows, the container image.

Read [docs/security/threat-model.md](docs/security/threat-model.md) first: it lists known threats and their status (fixed, accepted). A report about an already accepted threat is still welcome if it shows a larger impact than described there.

### What to include

- a short description and the impact (what an attacker can do),
- steps to reproduce (URL or route, account role, example request),
- the version: the commit hash of `main` you tested and the mode (`DATA_SOURCE=memory` or `postgres`),
- a suggested fix, if you have one.

Do not include real passwords, tokens, or guest or restaurant data. Use demo data for testing.

### What to expect

The project has a single owner and does not promise a response time. The owner acknowledges the report, assesses it (is it a vulnerability, how serious, does it concern code in this repository) and replies in the report. The fix goes to `main` like any change (tests, review); details can be disclosed after the fix is merged, in agreement with the reporter.

### Scope

- **In scope:** code in this repository (application, packages, scripts, workflows, the image built from `Dockerfile`).
- **Out of scope:** data and configuration of particular restaurants or installations, other people's deployments, third-party services and dependencies (report those to their authors; a flaw in how our code uses a dependency is in scope), attacks that need host access or other people's accounts, social engineering, load testing and denial of service against instances you do not own.

While testing, do not access other people's data beyond what is needed to show the problem, and do not destroy data.

### Supported versions

| Version | Supported |
|---|---|
| `main` | yes |
| other branches and tags | no |

Fixes are made on `main` only.
