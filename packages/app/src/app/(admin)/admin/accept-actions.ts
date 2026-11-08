'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, getPrincipal, sessionCookieOptions } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { domainError } from '@/server/domain-errors';
import { env } from '@/server/env';
import { logger } from '@/server/logger';
import { scrubbedError } from '@/server/scrub-error';

/**
 * A17 — accept an invitation (spec E12 F2, R4). A plain form post with the token in a hidden field (the link's page only shows the
 * form; the token never goes to the server as a GET side effect). A person without an account gets one and is signed in with the
 * password just chosen; a person with an account must already be signed in to it and only gets the membership. A dead link of any
 * kind (unknown, used, cancelled, expired, its inviter gone) ends on the same "not valid" page, without the token in the address.
 */
export async function acceptInvitation(form: FormData) {
  // the public demo is read-only (E22 R9): defence in depth, because no invitation can exist there. Nothing is looked up, created or signed in.
  if (env().showcaseMode === 'demo') redirect('/admin/login?error=showcase_read_only');
  const token = String(form.get('token') ?? '');
  const name = String(form.get('name') ?? '');
  const password = String(form.get('password') ?? '');
  const back = (error: string) => `/admin/accept?token=${encodeURIComponent(token)}&error=${error}`;

  const principal = await getPrincipal();
  const scope = await createRequestScope();
  let target = '/admin/login';
  try {
    const got = await scope.cradle.invitationService.accept({ token, name, password }, principal ? { userId: principal.user.id, email: principal.user.email } : null);
    target = `/admin/${got.restaurantSlug}`;
    if (got.newAccount) {
      try {
        const signedIn = await scope.cradle.authService.login(got.email, password);
        const jar = await cookies();
        const old = jar.get(SESSION_COOKIE)?.value;
        // a session of another person on this browser ends only now that the new account has one of its own
        if (old) await scope.cradle.authService.logout(old);
        jar.set(SESSION_COOKIE, signedIn.token, sessionCookieOptions(new Date(signedIn.principal.session.expiresAt)));
      } catch (loginError) {
        // the account and the membership exist and the link is spent: send the person to sign in with the password just chosen, and say so.
        // No token in the address, nothing to retry with.
        logger.warn('sign-in after accepting an invitation failed', { err: scrubbedError(loginError) });
        target = '/admin/login?notice=account_created';
      }
    }
  } catch (e) {
    const d = domainError(e);
    if (d?.code === 'invalid_token') redirect('/admin/accept?error=invalid_token');
    if (d?.code === 'validation_failed') {
      const f = d.fields ?? {};
      // a body that is not even shaped like a link (no field to blame) is a dead link like any other
      if (!f.password && !f.name) redirect('/admin/accept?error=invalid_token');
      redirect(back(f.password ? `password_${f.password}` : 'name_required'));
    }
    if (d) redirect(back(d.code));
    logger.error('accepting an invitation failed unexpectedly', { err: scrubbedError(e) });
    redirect(back('unexpected'));
  } finally {
    await scope.dispose();
  }
  redirect(target);
}
