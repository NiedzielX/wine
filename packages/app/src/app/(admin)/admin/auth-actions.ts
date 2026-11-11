'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, safeNext, sessionCookieOptions } from '@/server/auth';
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
