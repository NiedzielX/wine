---
date: 2026-11-05
tags: [logging, nextjs, privacy]
status: active
---

# `onRequestError` dostaje pełny URL z query i wszystkie nagłówki

## Kontekst
Faza F1 epiku E21: hook `onRequestError` w `instrumentation.ts` (Next.js 16.3).

## Co odkryto
- `request.path` zawiera query string (`sid`, `diet`, `without`), a `request.headers` cookies. Logowanie całego obiektu wycieka je mimo redakcji kluczy (wartość `sid` nie ma klucza z listy redakcji).
- `onRequestError` w testach Vitest jest no-opem, dopóki `NEXT_RUNTIME !== 'nodejs'`: test musi ustawić `vi.stubEnv('NEXT_RUNTIME', 'nodejs')`, inaczej asercja na logu widzi pusty wynik.
- Next sam rejestruje `uncaughtException` i tylko loguje; nasze handlery procesu też nie wołają `process.exit`.
- Connection string z hasłem w kodzie testu zapala `secrets:scan`: buduj go z części.

## Reguła
Loguj z `request` tylko `method`, ścieżkę przed `?` i wzorzec trasy z `context.routePath`.
