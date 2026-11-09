---
date: 2026-11-08
area: security
target: seed
commit: n/a (seed)
verdict: seed, brak sesji QA
bugs: 0
---

# security: granice dostępu, nagłówki i odpowiedzi błędów (wpis początkowy, seed, brak sesji QA)

Wpis wyjściowy zebrany z istniejących scenariuszy i modelu zagrożeń. **Nikt nie przeprowadził jeszcze sesji QA w prawdziwej przeglądarce dla tego obszaru; wszystko poniżej to stan testów automatycznych, nie wynik testowania.**

## Pokryte
Dziewięć scenariuszy `.ai/qa/security/` (`security-001` … `security-009`, w tym `security-004`), testy `access-boundaries.e2e.test.ts` i `security-headers.e2e.test.ts` w `packages/app/tests/e2e/`. Wyrocznie: `docs/security/threat-model.md` (T-01 obcy id obiektu pod własnym slugiem; T-02 eskalacja ról; T-03 fałszowanie formularza zaproszenia; T-05 flagi ciasteczka sesji; T-18 metryki i health) oraz `.ai/docs/engineering-standards.md` §10.
- `security-001`: id innej restauracji pod własnym slugiem daje 404, obcy slug 403, ładunki obu restauracji i skrót 12 tabel bez zmian po 11 próbach zapisu.
- `security-002` i `security-003`: hierarchia ról na każdym szczeblu; formularz zaproszenia nie zmienia roli ani restauracji, drugi post przekierowuje na stronę martwego linku.
- ``security-004`: publiczne strony kalkulatora niczego nie zapisują i nie ustawiają ciasteczka, niezależnie od metody. `security-005` … `security-009`: nagłówki bazowe, `no-store` dla strony zaproszenia i panelu, flagi ciasteczka sesji, brak szczegółów w błędach, metryki zamknięte (401 + `WWW-Authenticate`), health bez nazw bazy i wersji.

## Wynik sesji
Brak sesji QA. Jedyny zapisany dowód skuteczności testu to mutacja z logu `.ai/runs/2026-11-07-lesson-16-security.md`: usunięcie filtra `restaurant` w `PgImportRepository.find` zrobiło `access-boundaries` czerwonym (nie powtórzona w tej sesji).

## Punkty ryzyka (hotspoty)
- Odmowa 403/404 bez kontroli pozytywnej dla obu kont może znaczyć „zepsute wywołanie”, nie „granica” (lekcja `.ai/lessons/2026-11-07-access-boundary-three-checks.md`). Przy ręcznym QA granicy zawsze najpierw to samo wywołanie z kontem właściciela danych.
- Ukrycie przycisku nie jest zabezpieczeniem: przy zmianie uprawnień w UI sprawdź też bezpośredni adres i API.
- T-04 (zaproszenie bez weryfikacji e-maila) to **zaakceptowane ryzyko** (decyzja właściciela D5 w modelu zagrożeń): nie zgłaszaj go jako błąd.

## Wymaga ludzkiego oka
Brak (wpis seed).

## Luki
Brak sesji w przeglądarce; nie sprawdzono przepływu zaproszeń ani zmian ról przez interfejs, tylko przez testy HTTP; brak nagłówków sprawdzonych za prawdziwym reverse proxy (TLS, HSTS to zadanie proxy, poza repozytorium).
