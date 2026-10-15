import { ForbiddenError, authorize, can, membershipFor, type Actor, type Membership, type Permission, type Principal } from '@wine-match/core';
import { cookies, headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { cache } from 'react';
import { createRequestScope } from './container';
import { env } from './env';

/**
 * Sessions and access checks. The session is an opaque token in an httpOnly cookie; the database
 * knows only its hash. EVERY door re-checks here: the dashboard layout, every server action and
 * every API route. The UI hiding a button is a convenience, never the protection.
 */
export const SESSION_COOKIE = 'wm_session';

/** Secure cookies in production; `AUTH_COOKIE_SECURE=false` allows plain http (e.g. a production build on localhost). */
export function secureCookies(): boolean {
  return env().secureCookies;
}

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: secureCookies(), path: '/', expires };
}

/** The signed-in caller, or null. One lookup per request. */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const scope = await createRequestScope();
  try {
    return await scope.cradle.authService.authenticate(token);
  } finally {
    await scope.dispose();
  }
});

export interface Access {
  principal: Principal;
  membership: Membership;
  actor: Actor;
  can: (permission: Permission) => boolean;
}

export const toActor = (p: Principal): Actor => ({ id: p.user.id, name: p.user.name });

/** Only paths inside the dashboard are accepted as a place to go after sign-in (no open redirect). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !/^\/admin(\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]*)?(\?[^\s#]*)?$/.test(next) || next.includes('//') || next.startsWith('/admin/login')) return null;
  return next;
}

/**
 * Where the language switch returns to: the page it was on, if that is a dashboard page (`safeNext`), or the
 * sign-in page with its own validated `next`. Anything else goes to `/admin` (no open redirect).
 */
export function languageBack(back: string | null | undefined): string {
  const value = back ?? '';
  if (value === '/admin/login' || value.startsWith('/admin/login?')) {
    const next = safeNext(new URL(value, 'http://local').searchParams.get('next'));
    return next ? `/admin/login?next=${encodeURIComponent(next)}` : '/admin/login';
  }
  return safeNext(value) ?? '/admin';
}

/**
 * For pages and layouts. Not signed in → sign-in page (and back here afterwards);
 * signed in without access to this restaurant → 403.
 */
export const requireAccess = cache(async (slug: string): Promise<Access> => {
  const principal = await getPrincipal();
  if (!principal) {
    // where the user was going (set by src/proxy.ts), so sign-in can bring them back
    const wanted = safeNext((await headers()).get('x-pathname')) ?? `/admin/${slug}`;
    redirect(`/admin/login?next=${encodeURIComponent(wanted)}`);
  }
  const membership = membershipFor(principal, slug);
  if (!membership || !can(membership.role, 'panel.view')) forbidden();
  return { principal, membership, actor: toActor(principal), can: (p) => can(membership.role, p) };
});

/** For server actions: returns the actor or throws. `null` principal means the session ended. */
export async function authorizeAction(slug: string, permission: Permission): Promise<{ actor: Actor } | { signedOut: true }> {
  const principal = await getPrincipal();
  if (!principal) return { signedOut: true };
  authorize(principal, slug, permission);        // throws ForbiddenError
  return { actor: toActor(principal) };
}

export { ForbiddenError };
