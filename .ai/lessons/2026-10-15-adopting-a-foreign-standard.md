---
date: 2026-10-15
updated:
area: process
status: active
source: .ai/runs/2026-10-15-engineering-standards.md
---

# Dokument „do wdrożenia” może dotyczyć innego produktu: najpierw sprawdź, potem dostosuj, a odstępstwa zapisz

## Kontekst
Polecenie brzmiało „wdróż specyfikację z `.ai/docs/engineering-standards.md`”. Pod tą ścieżką nic nie było, a przekazany plik opisywał **inny produkt** (nazwy pakietów, pojęcia domenowe, odwrotny kierunek zależności, JWT zamiast sesji, brak ról i wielu najemców). Wykonanie go dosłownie zepsułoby architekturę, a odmowa wykonania nic by nie dała.

## Reguła
- Przed wdrożeniem sprawdź, **czy dokument dotyczy tego repozytorium** (ścieżki, nazwy, kierunki zależności) i czy plik w ogóle istnieje pod wskazaną ścieżką.
- Gdy dotyczy innego produktu: zachowaj oryginał jako dokument źródłowy z adnotacją (`.ai/docs/reference/`), napisz wersję dla tego projektu z **tabelą mapowania każdej reguły** (wdrożona / odstępstwo z powodem / nie dotyczy) i powiedz o tym człowiekowi na początku odpowiedzi.
- **Weryfikuj każdą regułę na kodzie.** Wdrażanie standardów jest okazją do znalezienia realnych błędów: tu parametry scrypt poniżej progu OWASP, Next.js z podatnościami, słowniki z kluczami od klienta, regresja budowania bez środowiska.
- Narzędzia z dokumentu sprawdź w naszym stosie, zanim je obiecasz (tu `typescript-eslint` nie działa z TypeScript 7, więc `oxlint`).

## Jak sprawdzić
`.ai/docs/engineering-standards.md` §1 ma wiersz dla każdej reguły oryginału.
