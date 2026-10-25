import { describe, expect, it } from 'vitest';
import { ForbiddenError, MemoryStore, membershipFor } from '@wine-match/core';
import { GET as pairingsList } from '@/app/api/v1/restaurants/[slug]/pairings/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { SESSION_COOKIE, authorizeAction, getPrincipal, requireAccess } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { loginAs, req } from './helpers';

/**
 * Spec E05-S01, AC8: the owner that `npm run restaurant:create` makes belongs to ONE restaurant. The memory data
 * source has no second restaurant, so the test adds the same rows the command writes (an account plus an owner
 * membership of another restaurant) and checks that every door of the dashboard keeps Halka closed to them.
 */
const NEW_SLUG = 'bistro-nad-wisla';
const URL0 = 'http://localhost:3000';
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function newOwner(): Promise<{ cookie: string; token: string; csrf: string }> {
  const scope = await createRequestScope();
  try {
    // the memory repository keeps its rows in a MemoryStore; the test reaches it to add the account
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;     // same hash, hence the same (public demo) password
    const id = '00000000-0000-4000-8000-0000000000a1';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'anna@example.com', name: 'Anna Nowak' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b1', restaurantSlug: NEW_SLUG, restaurantName: 'Bistro Nad Wisłą', role: 'owner' });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('anna@example.com');
}

describe('the owner of a freshly created restaurant', () => {
  it('has a membership only of their own restaurant', async () => {
    const s = await newOwner();
    globalThis.__wmNext.cookies.set(SESSION_COOKIE, s.token);
    const principal = (await getPrincipal())!;
    expect(principal.memberships.map((m) => m.restaurantSlug)).toEqual([NEW_SLUG]);
    expect(membershipFor(principal, 'halka')).toBeNull();
    expect(membershipFor(principal, NEW_SLUG)).toMatchObject({ role: 'owner' });
  });

  it('is refused by the dashboard layout and by server actions for Halka, and admitted to their own restaurant', async () => {
    const s = await newOwner();
    globalThis.__wmNext.cookies.set(SESSION_COOKIE, s.token);
    await expect(requireAccess('halka')).rejects.toBeInstanceOf(globalThis.__wmNext.ForbiddenSignal);
    await expect(authorizeAction('halka', 'panel.view')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(authorizeAction('halka', 'publish')).rejects.toBeInstanceOf(ForbiddenError);
    expect((await requireAccess(NEW_SLUG)).membership.role).toBe('owner');
    expect(await authorizeAction(NEW_SLUG, 'publish')).toMatchObject({ actor: { name: 'Anna Nowak' } });
  });

  it('gets 403 from the API of Halka, for reading and for writing', async () => {
    const s = await newOwner();
    expect((await pairingsList(req(`${URL0}/x`, { cookie: s.cookie }), params('halka'))).status).toBe(403);
    const publish = await publishPost(req(`${URL0}/x`, { cookie: s.cookie, 'x-csrf-token': s.csrf }, 'POST'), params('halka'));
    expect(publish.status).toBe(403);
  });
});
