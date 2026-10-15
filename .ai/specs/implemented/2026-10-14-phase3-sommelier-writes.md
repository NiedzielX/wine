---
status: implemented
created: 2026-10-14
owner: Filip
related: [.ai/specs/2026-10-14-mockups-to-app-migration-plan.md, .ai/runs/2026-10-14-sommelier-writes.md]
superseded_by:
---

# Faza 3 — zapisy sommeliera i publikacja

> Zakres zatwierdzony poleceniem właściciela („działaj szybko, decyzje podejmij sam zgodnie z wytycznymi”). Decyzje poniżej podjął agent według `AGENTS.md`; do przeglądu przez właściciela.

## Problem
Panel (Faza 2) tylko pokazuje dane. Sommelier nie może zatwierdzić pairingu, zmienić roli czy kolejności, dodać własnej pary, ukryć wina ani opublikować zmian dla gości.

## Cel i zakres
Zapisy sommeliera na pairingach i dostępności wina, historia decyzji, blokada optymistyczna i publikacja z migawką widoczną dla gości.
**Poza zakresem:** edycja dania i wina (profile, ceny — osobna specyfikacja), import, uwierzytelnianie (Faza 4), REST API zapisu (Faza 4).

## Decyzje
| Temat | Decyzja | Uzasadnienie |
|---|---|---|
| Zapisy w UI | Server Actions i zwykłe formularze (bez JS też działają), wynik przez parametry URL (`saved`, `error`) | zgodne z architekturą „działa bez JS”; brak osobnego API do utrzymania |
| REST API zapisu | **Nie w tej fazie** — razem z uwierzytelnianiem (Faza 4) | niezabezpieczony publiczny endpoint zapisu to ryzyko; spec API i tak wymaga sesji i CSRF |
| Zabezpieczenie do czasu Fazy 4 | `ADMIN_WRITES_ENABLED`: w produkcji zapisy są wyłączone, dopóki nie ustawi się `true`; w `dev` włączone. Panel pokazuje komunikat, gdy wyłączone | panel jest otwarty; zapis nie może być domyślnie dostępny w produkcji |
| Autor zmiany | Port `actor` w każdej komendzie; do Fazy 4 = Wine Director restauracji (jedno miejsce: `server/actor.ts`) | Faza 4 podmieni źródło bez zmiany serwisów |
| Publikacja | Migawka (`PublishedVersion`): goście czytają pairingi z **ostatniej opublikowanej wersji**, panel z danych bieżących. Dostępność wina i ustawienia gościa działają od razu (zgodnie ze specyfikacją A4/A11) | spec A11: „goście widzą wersję opublikowaną”; edycje sommeliera nie mogą od razu zmieniać tego, co widzi gość |
| Bez wersji | Restauracja bez żadnej publikacji pokazuje gościom dane bieżące (onboarding) | nie blokuje nowej restauracji |
| Licznik zmian | liczba pairingów z decyzją od ostatniej publikacji + dania `draft` | uwzględnia też usunięcia |
| Historia | `sommelier_decision` nie ma FK do pairingu (zostaje po usunięciu pary) | audyt nie może znikać wraz z rekordem |
| Wersjonowanie | `version` pairingu z formularza porównywane z bazą; niezgodność → konflikt z komunikatem | kryterium z planu |
| Primary | jeden na danie: serwis degraduje poprzedni, baza dodatkowo pilnuje indeksem | reguła w `core`, gwarancja w bazie |

## Wymagania
- R1 `core`: komendy `SommelierService` (approve, reject, restore, setRole, setComment, move, addManual, delete, approveAll, setWineActive) z regułami z mockupów; `PublishService` (preview, publish, updateSettings); błędy domenowe; porty zapisu z kontraktem dla pamięci i PostgreSQL.
- R2 `db`: encja `PublishedVersion`, zmiana `SommelierDecision`, migracja, repozytoria zapisu, seeder z wersją 1.
- R3 Goście czytają opublikowane pairingi; panel bieżące.
- R4 `app`: akcje serwerowe i formularze na ekranach A4, A6, A7; ekran A11 Publish z checklistą i ustawieniami; licznik zmian w nawigacji.

## Kryteria akceptacji
- [x] AC1 Wszystkie komendy z R1 mają testy reguł (pamięć) i kontrakt zapisu przechodzi na PostgreSQL.
- [x] AC2 Test integracyjny: konflikt wersji, unikalność Primary i pary w bazie, zachowanie historii po usunięciu, migawka niezmienna do publikacji.
- [x] AC3 Gość nie widzi zmian przed publikacją, widzi je po publikacji (test na obu źródłach danych).
- [x] AC4 Formularze działają w przeglądarce (z JS i bez) i w trybie wyłączonych zapisów pokazują komunikat zamiast zmieniać dane.
- [x] AC5 `typecheck`, `test`, `test:db`, `schema:check`, `build`, `smoke` zielone; granice pakietów zachowane.

## Projekt rozwiązania
`core`: `errors.ts`, `ports/runtime.ts` (Clock, IdGenerator), rozszerzone `ports/repositories.ts`, `services/pairing-rules.ts` (czyste planowanie zmian na kopii roboczej → lista operacji), `services/sommelier-service.ts`, `services/publish-service.ts`, pamięć z migawką i historią, `testing/write-contract.ts`. `db`: encje, migracja, repozytoria. `app`: `server/actions`, `server/write-guard.ts`, `server/actor.ts`, strony panelu.

## Ryzyka i otwarte pytania
- Indeks unikalny Primary nie jest odroczalny: degradacja musi poprzedzać awans (operacje w kolejności, flush po każdej).
- Panel jest bez logowania aż do Fazy 4.

## Realizacja
- Log: `.ai/runs/2026-10-14-sommelier-writes.md`; lekcje: `write-path-conventions`, `server-action-layout-revalidate`.
- **`core`:** `errors.ts`, `ports/runtime.ts`, porty zapisu i historii, `pairing-rules.ts` (`DishPlan` + reguły), `SommelierService`, `PublishService`, pamięć z migawką i historią, `AdminService.pairingWorkbench`, `write-contract.ts`; 96 testów.
- **`db`:** `PublishedVersion`, `SommelierDecision` bez FK, repozytoria zapisu z mapowaniem błędów bazy, seeder z wersją 1, migracja `published_versions_and_decision_history`; 21 testów integracyjnych.
- **`app`:** akcje serwerowe, `ActionButton`, komunikaty (`flash.tsx`), A6 / A7 / A4 z akcjami, ekran A11, liczniki w nawigacji, `ADMIN_WRITES_ENABLED`.
- **Odstępstwa od mockupów:** pairingi odrzucone nie znikają dla gości do publikacji; zmiana roli odrzuconego pairingu jest błędem (najpierw „Restore”); ranga Primary jest przypięta (nie da się go przesunąć).
- **Błędy znalezione weryfikacją:** (1) liczniki w nawigacji nieaktualne po akcji (layout) — `revalidatePath`; (2) `setRole` rzucał synchronicznie zamiast odrzucić obietnicę; (3) `changesCount` w kontrakcie nie liczył dań `draft` (błąd testu).
- **Weryfikacja:** typecheck; 96 testów jednostkowych; 21 integracyjnych na PostgreSQL (ten sam kontrakt zapisu co w pamięci, konflikt na dwóch sesjach, równoważność pamięć/PostgreSQL); `schema:check`; `build` z granicami; `npm run smoke` 56/56 w `memory` i `postgres`; w przeglądarce cały cykl sommeliera na PostgreSQL (z JS i bez), konflikt wersji, publikacja, dostępność wina, ustawienia, zapisy wyłączone, ochrona przed obcym adresem powrotu, tryb `memory`.
