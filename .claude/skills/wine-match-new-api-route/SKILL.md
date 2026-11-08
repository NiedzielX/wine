---
name: wine-match-new-api-route
description: Add a new REST route under packages/app/src/app/api/v1 in Wine Match the project way - handle() or handlePublic() with literal route and write, parseBody with a z.strictObject schema from core/validators, restaurantId resolved from the slug on the server, isUuid-safe id lookups, DomainError mapping, API_SPECIFICATION.md entry, e2e test plus QA scenario, and a green npm run check:routes. Use when asked to "add an endpoint", "new API route", "expose X over REST", or in Polish "nowa trasa API", "dodaj endpoint", "nowy route handler", "check:routes pada", "wyjątek w allowliście tras".
---

# Wine Match: new API route

A route parses input, calls a `core` service and returns JSON. It holds no business rules. Pattern files: `packages/app/src/app/api/v1/restaurants/[slug]/invitations/route.ts` (slug route, GET and POST) and `packages/app/src/app/api/v1/pairings/[id]/route.ts` (id route).

## Before you start
1. Read `.ai/lessons.md`, `packages/app/AGENTS.md`, `packages/core/AGENTS.md`, `.ai/docs/engineering-standards.md` (§5, §6, §8, §9, §10) and the conventions at the top of `docs/API_SPECIFICATION.md`.
2. A new endpoint changes the API contract, so it needs a spec (`AGENTS.md` §3). Implement only `approved` or `in-progress`; never set `approved` yourself. Open a run log (`AGENTS.md` §4).
3. A route with an object id in its path, a new role or a public entry is an access boundary: also follow the `wine-match-access-boundary-test` skill and add a row to `docs/security/threat-model.md`.

## Steps (the first one is a failing test)
1. **Red test.** A unit case in the style of `packages/app/tests/unit/routes.test.ts` (import `GET`/`POST` from the route file, build requests with `req(...)` and `jsonReq(...)` from `packages/app/tests/unit/helpers.ts`) and, for behaviour that matters over HTTP, a case in `packages/app/tests/e2e/` (`*.e2e.test.ts`). See it fail.
2. **Schema.** `packages/core/src/validators/<concept>/<name>.schema.ts` with `z.strictObject({...})` (an unknown field becomes 422 `unknown_field`), exported from `packages/core/src/validators/index.ts`. Test rejection of an unknown field and of each bad value (`packages/core/tests/validators.test.ts`). Client-chosen keys go into a `Map` or `Object.fromEntries`.
3. **Service method** in `packages/core/src/services/<concept>/` (or `auth/`). It takes `slug`, resolves `restaurantId` itself (`restaurantRepository.findBySlug(slug)`, then `NotFoundError('Restaurant')`, as `sommelier-service.ts` does) and passes `restaurantId` to every repository call; writes take `actor` and `expectedVersion`; failures are `DomainError`s from `packages/core/src/errors.ts`. The client never sends a `restaurantId`: the slug in the path (or `?restaurant=`) is the only tenant input.
4. **Ids.** A lookup by an id taken from the URL must treat a non-UUID as "not found", never as a driver error: `isUuid` from `packages/db/src/repositories/ids.ts`, used in `packages/db/src/repositories/*.ts`. A new repository method needs a case in `packages/core/src/testing/repository-contract.ts` ("treats an id that is not a UUID as unknown"), the memory implementation and the PostgreSQL one; run `npm run test:db`.
5. **Route file** `packages/app/src/app/api/v1/<path>/route.ts` with `export const dynamic = 'force-dynamic'`, one exported function per method, each shaped as:
   `return handle(req, { route: '/api/v1/<pattern>', write: <true for POST/PUT/PATCH/DELETE>, slug, permission: '<permission>' }, async ({ c, actor }) => { const input = await parseBody(req, schema); ...service call...; return NextResponse.json(...) })`
   - `handle()` (session, CSRF, permission) from `@/server/api-auth` is the default. `handlePublic()` is only for guest or sign-in endpoints that need no session and must be in the allowlist (step 6). `handleUnscoped` is for health only.
   - `route` is a string literal equal to the pattern of the file path (`[slug]` becomes `{slug}`) and unique across files; `write` is a literal.
   - `permission` comes from `packages/core/src/auth/permissions.ts` (single table); a new one needs the spec.
   - Nothing with `return`, `throw`, `if`, a loop or `try` before the wrapper: read `await ctx.params` first and validate inside the callback. No own `try/catch`: `instrumented()` in `packages/app/src/server/api-auth.ts` maps domain errors with `domainError()` (never `instanceof`) and answers anything else with a generic 500.
   - The body goes only through `parseBody(req, schema)`, never `req.json()`. Errors have the shape `{ error: { code, message, fields? } }` (`apiError`, `packages/app/src/server/api.ts`). Versioned resources use `If-Match` (`ifMatch`).
   - A new domain error class must be added to `NAMES` in `packages/app/src/server/domain-errors.ts` and to the status switch in `fromDomainError` (`api-auth.ts`).
6. **`npm run check:routes`** (`scripts/check-routes.mjs`, allowlist `scripts/check-routes.allowlist.json`). A new route passes without touching the allowlist. `publicRoutes` entries need `file`, `helper`, `methods` and a real `reason` and mean a door without a session: ask the owner. `exceptions` and `earlyReturns` are existing debt; never add to `earlyReturns` (move the validation inside the callback). A stale entry fails the check.
7. **Docs.** `docs/API_SPECIFICATION.md` (row with method, path, role letters, description, error codes); `BACKWARD_COMPATIBILITY.md` §2 if the contract grows; a check in `scripts/smoke.mjs` when the route is part of the running app.
8. **e2e and QA scenario.** Test in `packages/app/tests/e2e/`, scenario `.ai/qa/<area>/<area>-NNN-slug.md` and a row in `.ai/qa/INDEX.md` (`.ai/qa/README.md`); `npm run check:qa`.

## Done when
- [ ] Spec approved by a human and linked in the run log.
- [ ] A failing test existed first; unit and e2e are green.
- [ ] Schema is `strictObject` with a rejection test.
- [ ] `restaurantId` comes only from the slug on the server and every repository call carries it.
- [ ] Non-UUID ids answer 404, not 500 (contract test).
- [ ] Wrapper first, literal `route` and `write`, no own `try/catch`, errors as domain errors.
- [ ] `npm run check:routes` is green without new allowlist entries (or an owner-approved entry with reason and methods).
- [ ] `docs/API_SPECIFICATION.md`, QA scenario and INDEX row are updated; `npm run check:qa` is green.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; also `npm run test:db` and `npm run test:e2e` when services, ports or HTTP behaviour changed.

## Do not
- Do not put business rules, repository calls or `@wine-match/db` / `@mikro-orm/*` imports in `packages/app/src/app`.
- Do not accept `restaurantId` (or any tenant) from the body, query or headers.
- Do not log or return secrets, tokens, stack traces or connection details.
- Do not use `handlePublic` or an allowlist entry just to make the check pass.
- Do not check errors with `instanceof` or class names.
- Do not add dependencies or read `.env` files.
