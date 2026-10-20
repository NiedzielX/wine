---
date: 2026-10-19
updated:
area: tooling
status: active
source: .ai/runs/2026-10-19-ui-storybook-a11y.md
promoted:
---

# W świeżym worktree najpierw pełna `npm install`, dopiero potem `npm install -w <pakiet> -D …`

## Kontekst
W nowym worktree `npm install -w @wine-match/ui -D storybook@…` zakończył się sukcesem („added 309 packages”), ale `node_modules` nie zawierało `vitest`. `npm test -w @wine-match/ui` znalazł go w innym miejscu i dopiero po pełnej `npm install` testy ruszyły. Objaw: błąd `Cannot find package 'jsdom'` przy środowisku testowym, który nie był zależnością workspace’u, którego dotyczył install.

## Przyczyna
Instalacja z `-w` ogranicza drzewo do wskazanego workspace’u i jego zależności. W świeżym worktree reszta monorepo (w tym testowe narzędzia z roota) nie została zainstalowana.

## Reguła
W świeżym worktree: najpierw `npx -y npm@11.20.0 install` z roota (bez `-w`), dopiero potem dodawaj zależności, także z `-w`. Po dodaniu zależności sprawdź, że `node_modules/.bin/vitest` istnieje.

## Jak sprawdzić
`ls node_modules/.bin/vitest` w worktree po instalacji; `npm test -w @wine-match/ui` przechodzi bez „Cannot find package”.
