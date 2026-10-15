'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, safeNext, sessionCookieOptions } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { domainError } from '@/server/domain-errors';
import { logger } from '@/server/logger';

/** Sign in / sign out. Plain form posts: they work without JavaScript. */

export async function login(form: FormData) {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  const back = (error: string) => `/admin/login?error=${error}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  if (!email || !password) redirect(back('invalid_credentials'));

  const scope = await createRequestScope();
  let target: string;
  try {
    const { token, principal } = await scope.cradle.authService.login(email, password);
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(new Date(principal.session.expiresAt)));
    const first = principal.memberships.find((m) => m.role !== 'waiter');
    // login refuses an account with no dashboard role, so there is always a restaurant to go to
    target = next ?? `/admin/${first!.restaurantSlug}`;
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
