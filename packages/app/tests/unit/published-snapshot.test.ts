import { describe, expect, it } from 'vitest';
import { GET as menuGet } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { GET as recGet } from '@/app/api/v1/dishes/[dishId]/recommendations/route';
import { POST as bulkPost } from '@/app/api/v1/restaurants/[slug]/pairings/bulk-decision/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { createRequestScope } from '@/server/container';
import { jsonReq, loginAs, req } from './helpers';

/** Spec 2026-11-04-panel-completion, F1: the public API reads the published view and keeps its shape (AC3, AC6); publish takes `expectedLatest` (AC5). */

const URL0 = 'http://localhost:3000';
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
interface Menu { restaurant: Record<string, unknown>; categories: Array<{ name: string; dishes: Array<Record<string, unknown> & { id: string; name: string }> }> }
const menu = async () => (await (await menuGet(req(`${URL0}/api/v1/public/restaurants/halka/menu`), params({ slug: 'halka' }))).json()) as Menu;

describe('the public API on the published view', () => {
  it('the menu keeps its shape and lists only the dishes guests see', async () => {
    const data = await menu();
    expect(Object.keys(data).sort()).toEqual(['categories', 'restaurant']);
    expect(Object.keys(data.restaurant).sort()).toEqual(['name', 'slug']);
    const dishes = data.categories.flatMap((c) => c.dishes);
    expect(Object.keys(dishes[0]).sort()).toEqual(['description', 'hasSommelierPairing', 'id', 'name', 'price']);
    const c = await createRequestScope();
    const restaurant = (await c.cradle.restaurantRepository.findBySlug('halka'))!;
    const current = await c.cradle.dishRepository.listByRestaurant(restaurant.id);
    expect(dishes.map((d) => d.id).sort()).toEqual(current.filter((d) => d.status === 'published').map((d) => d.id).sort());
    const draft = current.find((d) => d.status === 'draft')!;
    expect((await recGet(req(`${URL0}/x?restaurant=halka`), params({ dishId: draft.id }))).status).toBe(404);
  });

  it('publish: a stale expectedLatest is 409 and writes nothing, an unknown field is 422, the right number publishes', async () => {
    const s = await loginAs('marta@halka.pl');
    const auth = { cookie: s.cookie, 'x-csrf-token': s.csrf };
    expect((await bulkPost(jsonReq(`${URL0}/x`, { action: 'approve_all' }, 'POST', auth), params({ slug: 'halka' }))).status).toBe(200);
    const before = (await menu()).categories.flatMap((c) => c.dishes).length;
    const stale = await publishPost(jsonReq(`${URL0}/x`, { expectedLatest: 0 }, 'POST', auth), params({ slug: 'halka' }));
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe('version_conflict');
    expect((await menu()).categories.flatMap((c) => c.dishes).length).toBe(before);
    expect((await publishPost(jsonReq(`${URL0}/x`, { expectedLatest: 1, extra: true }, 'POST', auth), params({ slug: 'halka' }))).status).toBe(422);
    const ok = await publishPost(jsonReq(`${URL0}/x`, { expectedLatest: 1 }, 'POST', auth), params({ slug: 'halka' }));
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as { number: number }).number).toBe(2);
    // the draft dish of the demo went live with this publish
    expect((await menu()).categories.flatMap((c) => c.dishes).length).toBe(before + 1);
  });
});
