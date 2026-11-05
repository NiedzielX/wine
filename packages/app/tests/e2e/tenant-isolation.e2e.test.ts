import { DEMO_PASSWORD } from '@wine-match/core';
import { describe, expect, inject, it } from 'vitest';
import { NEW_RESTAURANT } from './new-restaurant';

/**
 * Issue #95: on PostgreSQL, a real session of a user of restaurant A asks the panel and the API of restaurant B
 * (made by `restaurant:create` in global-setup) and of its own restaurant for what its role may not do. Every answer is 403
 * and carries no data of B. Plain `fetch` with the session cookie: no browser needed.
 */
describe('tenant isolation and roles on PostgreSQL', () => {
  const baseUrl = () => inject('e2e').baseUrl;
  const origin = () => new URL(baseUrl()).origin;

  async function signIn(email: string): Promise<{ cookie: string; csrf: string }> {
    const res = await fetch(`${baseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: origin() },
      body: JSON.stringify({ email, password: DEMO_PASSWORD })
    });
    expect(res.status, `sign in ${email}`).toBe(200);
    const token = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
    return { cookie: `wm_session=${token}`, csrf: ((await res.json()) as { csrfToken: string }).csrfToken };
  }
  const get = (path: string, cookie: string) => fetch(`${baseUrl()}${path}`, { headers: { cookie }, redirect: 'manual' });
  const post = (path: string, { cookie, csrf }: { cookie: string; csrf: string }, body: unknown = {}) =>
    fetch(`${baseUrl()}${path}`, {
      method: 'POST',
      headers: { cookie, 'x-csrf-token': csrf, origin: origin(), 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });

  it("a manager of Halka is refused by the panel and the API of another restaurant: 403 and none of its data", async () => {
    const session = await signIn('tomasz@halka.pl');
    const other = NEW_RESTAURANT.slug;
    const answers = [
      await get(`/admin/${other}`, session.cookie),
      await get(`/admin/${other}/setup`, session.cookie),
      await get(`/api/v1/restaurants/${other}/pairings`, session.cookie),
      await get(`/api/v1/restaurants/${other}/qr`, session.cookie),
      await post(`/api/v1/restaurants/${other}/publish`, session),
      await post(`/api/v1/restaurants/${other}/pairings/bulk-decision`, session, { action: 'approve_all' })
    ];
    for (const res of answers) {
      expect(res.status, res.url).toBe(403);
      const body = await res.text();
      expect(body).not.toContain(NEW_RESTAURANT.name);
      expect(body).not.toContain(NEW_RESTAURANT.ownerEmail);
    }
  });

  it('inside Halka the manager cannot decide pairings and the waiter cannot sign in to the panel: 403', async () => {
    const manager = await signIn('tomasz@halka.pl');
    // pairings.decide belongs to the Wine Director only (docs/USER_ROLES.md)
    expect((await post('/api/v1/restaurants/halka/pairings/bulk-decision', manager, { action: 'approve_all' })).status).toBe(403);

    const waiter = await fetch(`${baseUrl()}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: origin() },
      body: JSON.stringify({ email: 'kelner@halka.pl', password: DEMO_PASSWORD })
    });
    // waiters use the public staff lookup and have no dashboard login (permissions.ts, docs/USER_ROLES.md)
    expect(waiter.status).toBe(403);
    expect(((await waiter.json()) as { error: { code: string } }).error.code).toBe('no_panel_access');
  });
});
