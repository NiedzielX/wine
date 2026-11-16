'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEMO_PASSWORD, DEMO_USERS, isLocale } from '@wine-match/core';
import { SESSION_COOKIE, safeNext, secureCookies, sessionCookieOptions } from '@/server/auth';
import { demoAccounts, demoStartSlug, type DemoAccount } from '@/server/demo-entry';
import { LANG_COOKIE, langCookieOptions } from '@/server/lang-cookie';
import { createRequestScope } from '@/server/container';
import { domainError } from '@/server/domain-errors';
import { env } from '@/server/env';
import { logger } from '@/server/logger';
import { checkRateLimit } from '@/server/rate-limit';

/** Sign in / sign out. Plain form posts: they work without JavaScript. */

export async function login(form: FormData) {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const back = (error: string) => `/admin/login?error=${error}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  // the public demo is read-only: no account exists there and nothing is looked up (E22 Q5, R9)
  if (env().showcaseMode === 'demo') redirect(back('showcase_read_only'));
  return signIn(email, password, next, back);
}

/**
 * The one sign-in path of the form and of "Sign in as …" (spec 2026-11-16-interactive-demo-entry, R5): the `login` limit, the account
 * lockout and the log are here once. `back(error)` is where a refusal goes; `next` must already be a safe dashboard path (or null).
 * Always ends in a redirect (it throws), so the callers `return` it.
 */
async function signIn(email: string, password: string, next: string | null, back: (error: string) => string): Promise<never> {
  const scope = await createRequestScope();
  let target: string;
  try {
    // the same `login` limit as POST /api/v1/auth/login (spec E21 F3, R9): every attempt counts, also an empty one, and a refused
    // attempt never reaches the account (its lockout state does not change). The redirects are outside `try` (they throw).
    const limited = !(await checkRateLimit(scope.cradle, 'login', await headers())).allowed;
    if (limited || !email || !password) {
      target = back(limited ? 'rate_limited' : 'invalid_credentials');
    } else {
      const { token, principal } = await scope.cradle.authService.login(email, password);
      (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(new Date(principal.session.expiresAt)));
      const first = principal.memberships.find((m) => m.role !== 'waiter');
      // login refuses an account with no dashboard role, so there is always a restaurant to go to
      target = next ?? `/admin/${first!.restaurantSlug}`;
    }
  } catch (e) {
    const d = domainError(e);
    if (d) redirect(back(d.code === 'no_panel_access' ? 'no_panel_access' : 'invalid_credentials'));
    logger.error('login failed unexpectedly', { err: e });
    redirect(back('unexpected'));
  } finally {
    await scope.dispose();
  }
  redirect(target);
}

/**
 * "Sign in as Marta / Tomasz" on the interactive demo instance (spec 2026-11-16-interactive-demo-entry, R5). A server action is called by
 * its id, without the card, so it checks the condition itself: interactive mode, a known `key` of `DEMO_USERS`, and that the account exists
 * here and opens the dashboard. It takes no e-mail, no password and no restaurant from the form; the public demo password is read here and
 * never rendered. Anything else is refused like a wrong password. The only public door of this kind: see scripts/check-pages.allowlist.json.
 */
export async function loginAsDemo(form: FormData) {
  const e = env();
  const back = (error: string) => `/admin/login?error=${error}`;
  // the read-only demo has no accounts and no password: refuse before anything is looked up
  if (e.showcaseMode === 'demo') redirect(back('showcase_read_only'));
  const slug = demoStartSlug(e);
  if (!slug) redirect(back('invalid_credentials'));
  // the language chosen on /start survives the sign-in (the dashboard reads the cookie first); only `pl` / `en` are stored
  const lang = form.get('lang');
  if (isLocale(lang)) (await cookies()).set(LANG_COOKIE, lang, langCookieOptions(secureCookies()));
  const scope = await createRequestScope();
  let account: DemoAccount | undefined;
  try {
    account = (await demoAccounts(scope.cradle.authService, e)).find((a) => a.key === String(form.get('key') ?? ''));
  } finally {
    await scope.dispose();
  }
  const user = account && DEMO_USERS.find((u) => u.key === account.key);
  if (!user) redirect(back('invalid_credentials'));
  return signIn(user.email, DEMO_PASSWORD, `/admin/${slug}`, back);
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const scope = await createRequestScope();
    try { await scope.cradle.authService.logout(token); } finally { await scope.dispose(); }
  }
  jar.delete(SESSION_COOKIE);
  redirect('/admin/login');
}
