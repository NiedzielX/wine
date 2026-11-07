# Poor man's SAST and DAST: what was run and what was not

Date 2026-11-07, base `39d695b` (`main`) plus branch `sec/lesson-16-security-review`. Everything ran on a throwaway local PostgreSQL 16 (port 50301) with synthetic demo data and `next start` on `127.0.0.1:50311`. No third-party scanner was downloaded or installed (supply-chain rule of this review). Threat IDs refer to [`threat-model.md`](threat-model.md).

## Static (SAST)

| Check | What it covers | Result | Not covered |
|---|---|---|---|
| `npm run lint` (oxlint, `--deny-warnings`) | no `any`, empty `catch`, `console.*`, package import limits | 0 findings | no taint tracking; not a security rule set |
| `.github/workflows/codeql.yml` (CodeQL `javascript-typescript`, `build-mode: none`, PR + push + weekly, **`security-extended` query suite since 2026-11-07**) | data flow from request input to SQL, paths, HTML, plus the broader `security-extended` queries (more coverage, more false positives than the default suite) | **configuration reviewed, NOT run locally** (no CodeQL CLI here; GitHub runs it). Any new alert the extended suite raises on PR #127 is reported here and in the PR, not mass-suppressed | whether the check is required for merge is a branch protection setting I cannot see |
| `npm run audit:gate` | high and critical advisories in production dependencies | passed, high 0, critical 0 | dev dependencies; advisories newer than the registry snapshot |
| `npm run secrets:scan` | tracked files for key and token patterns | 21 matches, all on the allowlist (16 entries) | git history |
| grep for dangerous sinks in `app`, `core`, `db`, `ui` source (`dangerouslySetInnerHTML`, `eval(`, `new Function(`, `child_process`, `innerHTML`) | classic XSS and injection sinks | 0 hits | indirect sinks through libraries |
| grep for string-built SQL (`execute(` with template interpolation) outside migrations | SQL injection | 3 raw statements, all with `?` placeholders and bound values (`import.ts:78`, `invitations.ts:98,141`) | MikroORM query builder misuse |
| grep for `redirect(` with request-derived targets | open redirect | all targets built from validated slugs or `safeNext`/`safeBack` | – |

## Script-level DAST: `packages/app/tests/e2e/security-headers.e2e.test.ts`

Runs in the existing `e2e` CI job against the built app (`next start`), plain `fetch`, no browser.

| Area | Checked | Result |
|---|---|---|
| Headers, 11 kinds of answer (guest page and 404, unknown restaurant, sign-in, panel redirect, dead invitation link, showcase, public API, API 401 and 404, health) | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, CSP (`frame-ancestors`, `base-uri`, `object-src`, `form-action`), `Permissions-Policy`, absence of `X-Powered-By` | **3 gaps before** (banner everywhere, no framing protection on `/r/**`, `/demo/**` and the API, no CSP or Permissions-Policy), fixed in `next.config.ts`, green after |
| Cookie flags | `HttpOnly`, `SameSite=Lax`, `Path=/`, expiry on the session cookie; guests get no cookie | pass |
| `Secure` flag | default in production by config (`core/tests/env.test.ts:44`) | NOT observed on the wire (the harness runs over http with `AUTH_COOKIE_SECURE=false`) |
| Error answers (7 failing requests) | no stack, path, library or connection text; no banner | pass; note: malformed percent-encoding (`/r/%E0%A4%A`) answers a generic **500** (framework), recorded as T-17 |
| Metrics and health | 401 without bearer, health body names nothing | pass |
| Manual probes (not kept as tests) | 7 hostile guest queries (`sid`, `diet=__proto__`, `constructor`, huge budget, `lang=<script>`, NUL, `%%%`): all 200, no reflected script | pass |

## Not checked (honest list)

- **No browser run of the new CSP.** Directives were chosen so they cannot block scripts or styles (no `script-src`, `style-src`, `default-src`); form posts are same-origin. I could not drive a browser here (`agent-browser` is not installed on this machine), so the guest and panel flows were not clicked through with the new headers. The existing browser e2e blocks run in CI.
- **No HSTS.** Belongs to the TLS-terminating proxy (E11); not testable locally (Q1 in the threat model).
- **No script-src / nonce CSP** (T-16, open decision Q2).
- **No TLS, no proxy, no real deployment** (E11 not built): `Secure` cookie on the wire, proxy access log without the query string (T-12), body size limit at the proxy (T-23).
- **No load or rate-limit test**: login throttling per IP, guest write floods (T-07, T-13). No test of the account lockout as a denial of service.
- **No fuzzing of import files** (zip bombs, malformed XLSX/PDF) (T-19).
- **No authenticated crawl** of every panel page for headers beyond the sampled ones; the headers are set by one `source: '/:path*'` rule, so a page cannot opt out, but I sampled, not enumerated.
- **No mobile or print flow, no cache-poisoning test, no HTTP request smuggling test** (proxy-dependent).
- **CodeQL not run locally**; its findings (if any), including from the `security-extended` suite enabled 2026-11-07, are in the GitHub Security tab and the PR's checks, which I cannot read from here.
- **CSP `script-src` (T-16).** Decided (D2, PR #127): the partial CSP stays; a nonce-based strict `script-src` is a tracked follow-up after E11 F1 ships, not done in this review.
- Server-action endpoints were only probed with a forged id (404 "Server action not found."); the Origin check of Next.js for actions was relied on, not re-tested beyond the existing invitation test.
