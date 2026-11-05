# Naprawa błędu: zgłoszenie, dowód, review, bramki

Źródło: lekcja 14 kursu („Nie ufaj pierwszemu fixowi”). Zielone CI mówi, że kod robi to, co jego autor miał na myśli; nie mówi, że autor miał rację. „Naprawione” w terminalu agenta to deklaracja, a nie dowód. Badania z lekcji (SWE-bench): około 8% „poprawnych” poprawek psuło inne testy, około 30% zachowywało się inaczej niż poprawka człowieka, około 11% było błędnych.

## 1. Gdzie szukać błędów (testy od strony użytkownika)
Nie sprawdzaj „czy działa”, tylko „gdzie się wysypie”. Najpierw tam, gdzie agenci mylą się najczęściej: puste stany, granice (dokładnie na limicie, o jeden za dużo), pieniądze i ilości, czas (granica dnia serwisowego 04:00 Europe/Warsaw, wygasanie), uprawnienia i izolacja `restaurantId`, ponowne wysłanie tego samego, identyfikatory spoza UUID-a. Środowisko: `npm run test-env:up`; przy braku przeglądarki wystarczy `curl` (strony gościa działają bez JavaScriptu). Takie szukanie warto zlecić pod-agentowi w świeżej sesji, a jego zgłoszenie odtworzyć samodzielnie, zanim cokolwiek się poprawi.

## 2. Jak zgłosić błąd agentowi
- Krótko i konkretnie: kroki odtworzenia (adres, dane), oczekiwany i faktyczny wynik, **przypuszczalne miejsce** (plik, funkcja) i **jedno zdanie o przypuszczalnej przyczynie**. Wskazanie pliku zwiększa szansę naprawy mniej więcej dwukrotnie, a długi opis ją obniża (badanie na 433 zgłoszeniach).
- Screenshot albo skrypt reprodukcji zamiast opisu słowami. Agent bez nich zgaduje brakujące dane i zakłada, że błąd istnieje.
- Zgłoszenie przygotowuje skill `om-prepare-issue`, a łańcuch naprawy prowadzi `om-auto-fix-issue` (`om-verify-in-repo`: najpierw dowód, że błąd da się odtworzyć i nie jest już naprawiony; „no action needed” zamiast pustego przebiegu).

## 3. Dowód naprawy: czerwony przed, zielony po
Test poprawki musi pasować do **przyczyny** (a nie tylko do objawu) i być **czerwony na kodzie sprzed poprawki**. Test napisany przez tego samego agenta, który poprawiał, jest zgodny z jego rozumieniem błędu, nie z rzeczywistością, więc to sprawdzenie nie jest ozdobą.

```
npm run verify:regression -- packages/core/tests/foo.test.ts [packages/db/tests/bar.integration.test.ts] --markdown
```
Skrypt (`scripts/verify-regression.mjs`) cofa pliki poprawki do bazy (`origin/main`), uruchamia testy (muszą paść), przywraca gałąź i uruchamia je ponownie (muszą przejść). Wymaga czystego drzewa i zacommitowanej poprawki z testem. Wynik z `--markdown` idzie do opisu PR. Testy e2e dowodzimy scenariuszem `.ai/qa` i `om-auto-qa-pr` (różnicowy scenariusz w przeglądarce, przed i po, ze screenshotami); trzecia droga to ręczne `gh pr checkout <nr>` albo podgląd PR.

## 4. Review: inna sesja, najlepiej inny model
Recenzent, który pisał kod albo zna jego uzasadnienia, zgadza się z nim (skażony kontekst). Review robi druga sesja bez kontekstu autora: pod-agent dostaje numer PR-a i zasady repozytorium, nie dostaje wniosków autora. Brief: zbadaj, czy poprawka jest kompletna (czy inne ścieżki mają ten sam błąd), czy test naprawdę łapie błąd, czy łamie reguły. GitHub nie pozwala autorowi formalnie zatwierdzić własnego PR-a, więc wynik trafia do komentarza w PR; formalne zatwierdzenie zostaje człowiekowi.

## 5. Bramki
- **Deterministyczne** (ten sam kod, ten sam wynik): typy, lint, testy, build, `audit-gate` i Dependabot (zależności), `secrets:scan`, CodeQL (analiza przepływu danych pod kątem bezpieczeństwa, `.github/workflows/codeql.yml`, plik w repozytorium; wymaganym checkiem robi go ustawienie ochrony gałęzi przez właściciela).
- **Niedeterministyczne:** auto-review i auto-QA. Mądre, ale nie za każdym razem takie same.
- SonarQube Cloud jest wariantem analizy statycznej; wymaga konta i zgody właściciela organizacji, więc nie jest włączony.
- Człowiek dostaje wynik obu grup i decyduje o merge.

## 6. Lista kontrolna przed merge poprawki
1. Błąd odtworzony przed poprawką (kroki w PR).
2. `verify:regression`: czerwony przed, zielony po (wynik w PR).
3. Review drugiej sesji, uwagi uwzględnione, poprawka sprawdzona ponownie.
4. Wszystkie checki CI zielone; ponowne odtworzenie scenariusza w aplikacji.
5. Dwie liczby do retrospektywy: ile poprawek przeszło bez uwag, a ile wróciło po review.
