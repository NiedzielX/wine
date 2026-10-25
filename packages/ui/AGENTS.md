# packages/ui — AGENTS.md

Zasady ogólne: `../../AGENTS.md` (§1.2 i §1.4). Szczegóły architektury: `../../.ai/docs/architecture-rules.md`.

**Co tu jest:** komponenty shadcn/ui (`src/components`, styl new-york-v4), komponenty marki Wine Match (`src/brand`, np. `MatchGlass`), `cn` (`src/lib/utils.ts`), motyw panelu (`src/styles.css`), konfiguracja shadcn (`components.json`).

**Zasady:**
- Komponenty shadcn dodawaj poleceniem `npx shadcn add <nazwa>` uruchomionym w `packages/ui`, potem wyeksportuj je w `src/index.ts`. Zmiany w ich kodzie ograniczaj do minimum, żeby dało się je aktualizować.
- `src/brand/*` to komponenty używane także na stronach gościa: tylko Tailwind i SVG, bez shadcn, bez Radix, bez zależności od motywu panelu (kolory przez propsy lub klasy wywołującego).
- Pakiet jest prezentacyjny: bez pobierania danych, bez importów z `core`, `db`, `app` i Next.js. Typy danych przyjmuj jako propsy.
- Kolory motywu panelu zmieniaj w `src/styles.css` (zmienne `:root` i `.dark`), nie w komponentach.

- `src/backend/feedback`: `EmptyState`, `ErrorMessage`, `LoadingMessage` — jedyny sposób na stan pusty / błąd / ładowanie w panelu. Nowy generyczny wzorzec panelu (niezwiązany z jednym pojęciem) trafia do `src/backend/<kategoria>/`; komponent jednej strony leży obok jej `page.tsx`.

**Lokalne poprawki komponentów shadcn** (zachowaj przy aktualizacji z `npx shadcn add`):
- `components/progress.tsx`: `value` przekazane do `ProgressPrimitive.Root` — bez tego pasek jest ogłaszany jako „indeterminate” (brak `aria-valuenow`).
