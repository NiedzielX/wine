import { describe, expect, inject, it } from 'vitest';
import { NEW_RESTAURANT } from './new-restaurant';

/**
 * The owner made by `npm run restaurant:create` (global-setup runs the real command after the demo seed) signs in,
 * sees the Setup of their restaurant and is kept out of Halka. Plain HTTP against the built app: no browser needed.
 */
describe('restaurant created by the operator command', () => {
  const baseUrl = () => inject('e2e').baseUrl;
  const origin = () => new URL(baseUrl()).origin;

  async function signIn(): Promise<{ cookie: string; csrf: string }> {
    const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: origin() },
      body: JSON.stringify({ email: NEW_RESTAURANT.ownerEmail, password: NEW_RESTAURANT.password })
    });
    expect(res.status).toBe(200);
    const token = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    expect(token).toBeTruthy();
    return { cookie: `wm_session=${token}`, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
  }

  const get = (path: string, cookie: string) => fetch(`${baseUrl()}${path}`, { headers: { cookie }, redirect: 'manual' });

  it('the new owner signs in and belongs only to the new restaurant', async () => {
    const { cookie } = await signIn();
    const me = (await (await get('/api/v1/auth/me', cookie)).json()) as { memberships: { restaurantSlug: string; role: string }[] };
    expect(me.memberships).toEqual([expect.objectContaining({ restaurantSlug: NEW_RESTAURANT.slug, role: 'owner' })]);
  });

  it('sees the Setup of their restaurant, with the menu import as the next step', async () => {
    const { cookie } = await signIn();
    const res = await get(`/admin/${NEW_RESTAURANT.slug}/setup`, cookie);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Import your menu');
    expect(html).toContain(NEW_RESTAURANT.name);
  });

  it('is refused by the panel and the API of Halka with 403', async () => {
    const { cookie, csrf } = await signIn();
    expect((await get('/admin/halka', cookie)).status).toBe(403);
    expect((await get('/admin/halka/setup', cookie)).status).toBe(403);
    expect((await get('/api/v1/restaurants/halka/pairings', cookie)).status).toBe(403);
    const publish = await fetch(`${baseUrl()}/api/v1/restaurants/halka/publish`, {
      method: 'POST', headers: { cookie, 'x-csrf-token': csrf, origin: origin() }
    });
    expect(publish.status).toBe(403);
  });

  it('the guest page of the new restaurant is up from the start, and its owner cannot sign in with a wrong password', async () => {
    expect((await fetch(`${baseUrl()}/r/${NEW_RESTAURANT.slug}`)).status).toBe(200);
    const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: origin() },
      body: JSON.stringify({ email: NEW_RESTAURANT.ownerEmail, password: 'not-the-password-123' })
    });
    expect(res.status).toBe(401);
  });
});
