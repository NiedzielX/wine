import type { Actor, Permission } from '@wine-match/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authorizeAction } from './auth';
import { createRequestScope, type Cradle } from './container';
import { domainError } from './domain-errors';
import { logger } from './logger';

/**
 * The shared core of the dashboard's server actions: session and permission check, the service call,
 * and a redirect with the result in the URL (`?saved=…` / `?error=…`). Not a 'use server' file: the
 * actions themselves live next to the pages and call `act()`.
 */

const ADMIN_PATH = /^\/admin\/[a-z0-9-]{2,40}(\/[A-Za-z0-9._~%/-]*)?(\?[^\s#]*)?$/;

export const str = (f: FormData, k: string) => String(f.get(k) ?? '');
export const version = (f: FormData) => { const n = Number(f.get('version')); return Number.isFinite(n) && n > 0 ? n : undefined; };

/** Only paths inside this restaurant's dashboard are accepted (no open redirect). */
export function safeBack(slug: string, back: string): string {
  const root = `/admin/${slug}`;
  return back === root || back.startsWith(`${root}/`) || back.startsWith(`${root}?`) ? back : root;
}

export function withFlash(back: string, flash: Record<string, string>): string {
  const url = new URL(back, 'http://local');
  for (const k of ['saved', 'error', 'n']) url.searchParams.delete(k);
  for (const [k, v] of Object.entries(flash)) url.searchParams.set(k, v);
  return `${url.pathname}${url.search}`;
}

export type Ctx = { c: Cradle; slug: string; actor: Actor; form: FormData };

/**
 * Runs one change. Every action re-checks the session and the permission here: the layout's check
 * does not protect a form post that is sent directly. A signed-out caller goes to the sign-in page.
 */
export async function perform(form: FormData, permission: Permission, change: (ctx: Ctx) => Promise<Record<string, string>>): Promise<{ back: string; flash: Record<string, string> } | 'signed-out'> {
  const slug = str(form, 'slug');
  const back = safeBack(slug, str(form, 'back'));
  let access;
  try {
    access = await authorizeAction(slug, permission);
  } catch (e) {
    const d = domainError(e);
    if (d) return { back, flash: { error: d.code } };
    throw e;
  }
  if ('signedOut' in access) return 'signed-out';
  const scope = await createRequestScope();
  try {
    return { back, flash: await change({ c: scope.cradle, slug, actor: access.actor, form }) };
  } catch (e) {
    const d = domainError(e);
    if (d) return { back, flash: { error: d.code } };
    logger.error('admin action failed', { err: e, slug });
    return { back, flash: { error: 'unexpected' } };
  } finally {
    await scope.dispose();
  }
}

export async function act(form: FormData, permission: Permission, change: (ctx: Ctx) => Promise<Record<string, string>>): Promise<never> {
  const result = await perform(form, permission, change);
  if (result === 'signed-out') redirect(`/admin/login?next=${encodeURIComponent(safeBack(str(form, 'slug'), str(form, 'back')))}`);
  // The sidebar counters (review queue, unpublished changes) live in the layout, which Next.js
  // keeps across client-side navigations: without this they would show the numbers from before the change.
  revalidatePath(`/admin/${str(form, 'slug')}`, 'layout');
  // A change may send the user somewhere else (the import preview, a renamed restaurant): `to` must be a dashboard path.
  const { to, ...flash } = result.flash;
  const target = to && ADMIN_PATH.test(to) && !to.startsWith('/admin/login') ? to : result.back;
  const slugOfTarget = /^\/admin\/([a-z0-9-]+)/.exec(target)?.[1];
  if (slugOfTarget && slugOfTarget !== str(form, 'slug')) revalidatePath(`/admin/${slugOfTarget}`, 'layout');
  redirect(withFlash(target, flash));
}
