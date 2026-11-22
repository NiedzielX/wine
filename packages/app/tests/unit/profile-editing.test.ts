import { MemoryStore, can, dishScales, profileVersion, wineScales } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeAll, describe, expect, it } from 'vitest';
import DishPage from '@/app/(admin)/admin/[slug]/menu/[dishId]/page';
import WinePage from '@/app/(admin)/admin/[slug]/wines/[wineId]/page';
import { GET as dishProfileGet, PUT as dishProfilePut } from '@/app/api/v1/dishes/[dishId]/profile/route';
import { GET as dishPreview } from '@/app/api/v1/dishes/[dishId]/profile/preview/route';
import { GET as wineProfileGet, PUT as wineProfilePut } from '@/app/api/v1/wines/[id]/profile/route';
import { GET as winePreview } from '@/app/api/v1/wines/[id]/profile/preview/route';
import { POST as publishPost } from '@/app/api/v1/restaurants/[slug]/publish/route';
import { SESSION_COOKIE } from '@/server/auth';
import { createRequestScope } from '@/server/container';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { jsonReq, loginAs, req } from './helpers';

const req0Login = (email: string) => loginRoute(jsonReq('http://localhost:3000/api/v1/auth/login', { email, password: 'demo-halka-2026' }));

/**
 * Spec 2026-11-04-panel-completion, F2: the profile routes (R3, R7, R8, Q12) and A3 / A5 as the server sends them, without
 * JavaScript (R7, AC13). Roles (AC14): the Wine Director and the General Manager may edit, the waiter and an owner of another
 * restaurant get 403 and nothing changes. A waiter has no dashboard login at all (sign-in answers 403, so there is no session to
 * try with); the permission table is asserted instead.
 */
const URL0 = 'http://localhost:3000';
const state = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string>; cookies: Map<string, string> } }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string | string[] | undefined>> }>;

async function render(page: unknown, params: Record<string, string>, searchParams: Record<string, string> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  state().headers.clear();
  state().headers.set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { params: Promise.resolve({ slug: 'halka', ...params }), searchParams: Promise.resolve(searchParams) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}

type Session = { cookie: string; token: string; csrf: string };
let marta: Session; let tomasz: Session; let outsider: Session;
let dishId = ''; let wineId = ''; let draftDishId = '';
const ctxDish = () => ({ params: Promise.resolve({ dishId }) });
const ctxWine = () => ({ params: Promise.resolve({ id: wineId }) });
const write = (s: Session, extra: Record<string, string> = {}) => ({ cookie: s.cookie, 'x-csrf-token': s.csrf, ...extra });

async function outsiderSession(): Promise<Session> {
  const scope = await createRequestScope();
  try {
    const store = (scope.cradle.authRepository as unknown as { store: MemoryStore }).store;
    const template = store.users.find((u) => u.email === 'marta@halka.pl')!;
    const id = '00000000-0000-4000-8000-0000000000a2';
    if (!store.users.some((u) => u.id === id)) {
      store.users.push({ ...template, id, email: 'olga@example.com', name: 'Olga Owner' });
      store.memberships.push({ userId: id, restaurantId: '00000000-0000-4000-8000-0000000000b2', restaurantSlug: 'other-place', restaurantName: 'Other Place', role: 'owner',
        membershipId: '00000000-0000-4000-8000-0000000000c2', status: 'active', version: 1, createdAt: '2026-10-20T08:00:00.000Z', deactivatedAt: null, deactivatedBy: null });
    }
  } finally {
    await scope.dispose();
  }
  return loginAs('olga@example.com');
}

const stored = async () => {
  const scope = await createRequestScope();
  try {
    const d = await scope.cradle.adminService.dishDetail('halka', dishId);
    const w = await scope.cradle.adminService.wineDetail('halka', wineId);
    return { dish: d!.source, wine: w!.source };
  } finally {
    await scope.dispose();
  }
};
const query = (scales: Record<string, unknown>) => new URLSearchParams(Object.fromEntries(Object.entries(scales).map(([k, v]) => [k, String(v)]))).toString();

beforeAll(async () => {
  [marta, tomasz, outsider] = [await loginAs('marta@halka.pl'), await loginAs('tomasz@halka.pl'), await outsiderSession()];
  const scope = await createRequestScope();
  const menu = (await scope.cradle.adminService.menu('halka'))!.rows.map((r) => r.dish);
  dishId = menu.find((d) => d.name === 'Duck breast')!.id;
  draftDishId = menu.find((d) => d.profile.source === 'draft' && d.status === 'published')?.id ?? menu.find((d) => d.profile.source === 'draft')!.id;
  wineId = (await scope.cradle.adminService.wines('halka'))!.rows.find((r) => r.wine.active)!.wine.id;
  await scope.dispose();
});

describe('GET and PUT /dishes/{dishId}/profile', () => {
  it('GET returns the profile with its fingerprint as ETag; PUT needs it in If-Match (428 without, 400 malformed)', async () => {
    const got = await dishProfileGet(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), ctxDish());
    expect(got.status).toBe(200);
    const body = (await got.json()) as { profile: Record<string, unknown>; version: string };
    expect(got.headers.get('etag')).toBe(`"${body.version}"`);
    expect(body.version).toBe(profileVersion((await stored()).dish.profile));
    const scales = dishScales((await stored()).dish.profile);
    const put = (headers: Record<string, string>, b: unknown = { profile: scales, confirm: true }) => dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, b, 'PUT', write(marta, headers)), ctxDish());
    expect((await put({})).status).toBe(428);
    expect((await put({ 'if-match': 'garbage' })).status).toBe(400);
    expect((await put({ 'if-match': `"${body.version}"` }, { profile: scales })).status).toBe(422);
  });

  it('saves with the fingerprint, answers the new one, and a stale fingerprint is 409 with nothing changed', async () => {
    const before = (await stored()).dish.profile;
    const version = profileVersion(before);
    const next = { ...dishScales(before), intensity: (before.intensity + 2) % 6 };
    const ok = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: next, confirm: true }, 'PUT', write(marta, { 'if-match': `"${version}"` })), ctxDish());
    expect(ok.status).toBe(200);
    const saved = (await ok.json()) as { changed: boolean; version: string; profile: { intensity: number; source: string; confirmedBy: string } };
    expect(saved).toMatchObject({ changed: true, profile: { intensity: next.intensity, source: 'confirmed', confirmedBy: 'Marta Wierzbicka' } });
    expect(ok.headers.get('etag')).toBe(`"${saved.version}"`);
    // the same stale form again: 409, the stored profile is the first save
    const stale = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: { ...next, intensity: before.intensity }, confirm: true }, 'PUT', write(marta, { 'if-match': `"${version}"` })), ctxDish());
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe('version_conflict');
    expect((await stored()).dish.profile.intensity).toBe(next.intensity);
    // saved again with no change: changed false
    const same = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: next, confirm: true }, 'PUT', write(marta, { 'if-match': `"${saved.version}"` })), ctxDish());
    expect(((await same.json()) as { changed: boolean }).changed).toBe(false);
  });

  it('refuses a body with a scale out of range, a stray field or a planted restaurant: 422, nothing written', async () => {
    const before = JSON.stringify((await stored()).dish.profile);
    const version = profileVersion((await stored()).dish.profile);
    const scales = dishScales((await stored()).dish.profile);
    for (const body of [
      { profile: { ...scales, intensity: 6 }, confirm: true }, { profile: { ...scales, fat: 2.5 }, confirm: true }, { profile: { ...scales, protein: 'x' }, confirm: true },
      { profile: { ...scales, source: 'confirmed' }, confirm: true }, { profile: scales, confirm: true, restaurantId: 'x' }, { profile: scales, confirm: 'yes' }
    ]) {
      const r = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, body, 'PUT', write(marta, { 'if-match': `"${version}"` })), ctxDish());
      expect(r.status, JSON.stringify(body)).toBe(422);
    }
    expect(JSON.stringify((await stored()).dish.profile)).toBe(before);
    expect((await dishProfilePut(jsonReq(`${URL0}/x`, { profile: scales, confirm: true }, 'PUT', write(marta, { 'if-match': `"${version}"` })), ctxDish())).status).toBe(422);
  });

  it('the General Manager may edit; an owner of another restaurant gets 403 on read, write and preview, a waiter cannot sign in and has no `profiles.edit`, and nothing changes (AC14)', async () => {
    const before = JSON.stringify((await stored()).dish.profile);
    const version = profileVersion((await stored()).dish.profile);
    const scales = dishScales((await stored()).dish.profile);
    const mgr = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: scales, confirm: true }, 'PUT', write(tomasz, { 'if-match': `"${version}"` })), ctxDish());
    expect(mgr.status).toBe(200);
    expect((await dishPreview(req(`${URL0}/x?restaurant=halka&${query(scales)}`, { cookie: tomasz.cookie }), ctxDish())).status).toBe(200);
    const after = JSON.stringify((await stored()).dish.profile);
    expect((await req0Login('kelner@halka.pl')).status).toBe(403);
    expect(can('waiter', 'profiles.edit')).toBe(false);
    for (const who of [outsider]) {
      expect((await dishProfileGet(req(`${URL0}/x?restaurant=halka`, { cookie: who.cookie }), ctxDish())).status).toBe(403);
      expect((await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: { ...scales, intensity: 0 }, confirm: true }, 'PUT', write(who, { 'if-match': `"${profileVersion((await stored()).dish.profile)}"` })), ctxDish())).status).toBe(403);
      expect((await dishPreview(req(`${URL0}/x?restaurant=halka&${query(scales)}`, { cookie: who.cookie }), ctxDish())).status).toBe(403);
    }
    expect(JSON.stringify((await stored()).dish.profile)).toBe(after);
    expect(before.length).toBeGreaterThan(0);
    // signed out
    expect((await dishPreview(req(`${URL0}/x?restaurant=halka&${query(scales)}`), ctxDish())).status).toBe(401);
  });

  it('a dish id that is not a UUID or not in this restaurant is 404, never a 500', async () => {
    const scales = dishScales((await stored()).dish.profile);
    const none = { params: Promise.resolve({ dishId: 'abc' }) };
    expect((await dishProfileGet(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), none)).status).toBe(404);
    expect((await dishPreview(req(`${URL0}/x?restaurant=halka&${query(scales)}`, { cookie: marta.cookie }), none)).status).toBe(404);
    expect((await dishProfileGet(req(`${URL0}/x?restaurant=nope`, { cookie: marta.cookie }), ctxDish())).status).toBe(403);
  });
});

describe('GET /dishes/{dishId}/profile/preview and /wines/{id}/profile/preview', () => {
  it('returns the table of before and after scores for the dish; the same answer the page renders; nothing is written (AC11, AC13)', async () => {
    const before = JSON.stringify(await stored());
    const scales = { ...dishScales((await stored()).dish.profile), intensity: 5, fat: 5 };
    const res = await dishPreview(req(`${URL0}/x?restaurant=halka&${query(scales)}`, { cookie: marta.cookie }), ctxDish());
    expect(res.status).toBe(200);
    const p = (await res.json()) as { kind: string; rows: Array<{ otherName: string; before: number; after: number; delta: number }>; summary: { changedRows: number } };
    expect(p.kind).toBe('dish');
    expect(p.rows.length).toBeGreaterThan(3);
    expect(p.rows.every((r) => r.delta === r.after - r.before)).toBe(true);
    expect(JSON.stringify(await stored())).toBe(before);
    state().cookies.set(SESSION_COOKIE, marta.token);
    const html = await render(DishPage, { dishId }, Object.fromEntries(new URLSearchParams(query(scales))));
    for (const r of p.rows) expect(html).toContain(`${r.before} → ${r.after}, ${r.delta > 0 ? `+${r.delta}` : r.delta < 0 ? `−${Math.abs(r.delta)}` : 'no change'}`);
  });

  it('a missing or invalid scale is a validation error (422), a wine preview needs all its scales', async () => {
    const dishQuery = query({ ...dishScales((await stored()).dish.profile), intensity: 9 });
    expect((await dishPreview(req(`${URL0}/x?restaurant=halka&${dishQuery}`, { cookie: marta.cookie }), ctxDish())).status).toBe(422);
    expect((await dishPreview(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), ctxDish())).status).toBe(422);
    expect((await dishPreview(req(`${URL0}/x`, { cookie: marta.cookie }), ctxDish())).status).toBe(422);
    const wine = wineScales((await stored()).wine.profile);
    const ok = await winePreview(req(`${URL0}/x?restaurant=halka&${query({ ...wine, body: 5 })}`, { cookie: marta.cookie }), ctxWine());
    expect(ok.status).toBe(200);
    const w = (await ok.json()) as { kind: string; rows: Array<{ otherName: string }>; guest: unknown[] };
    expect(w.kind).toBe('wine');
    expect(w.rows.length).toBeGreaterThan(3);
    expect((await winePreview(req(`${URL0}/x?restaurant=halka&${query({ ...wine, alcohol: 40 })}`, { cookie: marta.cookie }), ctxWine())).status).toBe(422);
    expect((await winePreview(req(`${URL0}/x?restaurant=halka&${query(wine)}`, { cookie: outsider.cookie }), ctxWine())).status).toBe(403);
  });
});

describe('GET and PUT /wines/{id}/profile', () => {
  it('saves a wine profile as a draft and as confirmed; a stale fingerprint is 409; a role without permission is 403', async () => {
    const before = (await stored()).wine.profile;
    const scales = wineScales(before);
    const put = (s: Session, version: string, body: unknown) => wineProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, body, 'PUT', write(s, { 'if-match': `"${version}"` })), ctxWine());
    const v0 = profileVersion(before);
    const draft = await put(marta, v0, { profile: { ...scales, alcohol: 14.5 }, confirm: false });
    expect(draft.status).toBe(200);
    const d = (await draft.json()) as { changed: boolean; version: string; profile: { alcohol: number; source: string } };
    expect(d).toMatchObject({ changed: true, profile: { alcohol: 14.5, source: 'grape_defaults' } });
    expect((await put(marta, v0, { profile: scales, confirm: true })).status).toBe(409);
    expect((await put(outsider, d.version, { profile: scales, confirm: true })).status).toBe(403);
    expect((await stored()).wine.profile).toMatchObject({ alcohol: 14.5, source: 'grape_defaults' });
    const confirmed = await put(tomasz, d.version, { profile: { ...scales, alcohol: 14.5 }, confirm: true });
    expect(((await confirmed.json()) as { profile: { source: string; confirmedBy: string } }).profile).toMatchObject({ source: 'confirmed', confirmedBy: 'Tomasz Lis' });
    expect((await wineProfileGet(req(`${URL0}/x?restaurant=halka`, { cookie: marta.cookie }), ctxWine())).headers.get('etag')).toMatch(/^"[0-9a-f]{8}-\d+"$/);
    expect((await put(marta, d.version, { profile: { ...scales, alcohol: 26 }, confirm: true })).status).toBe(422);
  });
});

describe('A3 and A5 without JavaScript', () => {
  it('A3 shows the editor with the stored values, the state banner and the three buttons of a draft; no script is needed', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const draft = { dishId: draftDishId };
    const html = await render(DishPage, draft);
    expect(html).toContain('id="profile-editor"');
    expect(html).toContain('Edit taste profile');
    expect(html).toMatch(/<form[^>]*method="get"/);
    expect(html).toContain('Show how the match changes');
    expect(html).toContain('Save and confirm');
    expect(html).toContain('Save as draft');
    expect(html).toContain('data-testid="profile-state"');
    const scope = await createRequestScope();
    const d = (await scope.cradle.adminService.dishDetail('halka', draftDishId))!;
    await scope.dispose();
    expect(html).toContain(d.source.profile.source === 'draft' ? 'Not confirmed yet' : 'Confirmed by');
    if (d.source.profile.source === 'draft') expect(html).toContain('Confirm without changes');
    expect(html).toContain(`name="version" value="${profileVersion(d.source.profile)}"`);
    expect(html).not.toContain('<script src');
  });

  it('A3 with invalid scales in the URL says so and offers no save; the same in Polish', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const scales = { ...dishScales((await stored()).dish.profile), intensity: 9 };
    const en = await render(DishPage, { dishId }, Object.fromEntries(new URLSearchParams(query(scales))));
    expect(en).toContain('The preview needs valid values.');
    expect(en).not.toContain('Save and confirm');
    const pl = await render(DishPage, { dishId }, Object.fromEntries(new URLSearchParams(query(scales))), 'pl');
    expect(pl).toContain('Podgląd wymaga poprawnych wartości.');
    expect(pl).toContain('Edytuj profil smaku');
  });

  it('A5 shows the wine editor and, with a candidate in the URL, the table of dishes before and after', async () => {
    state().cookies.set(SESSION_COOKIE, marta.token);
    const plain = await render(WinePage, { wineId });
    expect(plain).toContain('Edit taste profile');
    expect(plain).toContain('name="alcohol"');
    expect(plain).toContain('name="adventurous"');
    const scales = { ...wineScales((await stored()).wine.profile), body: 5, tannin: 5 };
    const html = await render(WinePage, { wineId }, Object.fromEntries(new URLSearchParams(query(scales))));
    expect(html).toContain('How the match changes');
    expect(html).toContain('Match Score');
    expect(html).toMatch(/\d+ → \d+, /);
  });
});

describe('profile edits and publishing (AC15)', () => {
  it('an edit is one more unpublished change and guests see the old score until the next publish', async () => {
    const preview = async () => {
      const scope = await createRequestScope();
      try { return (await scope.cradle.publishService.preview('halka')).pendingChanges; } finally { await scope.dispose(); }
    };
    const guestScores = async () => {
      const scope = await createRequestScope();
      try { return (await scope.cradle.recommendationService.forDish('halka', dishId, {}, 8))!.result.items.map((i) => i.matchScore); } finally { await scope.dispose(); }
    };
    // publish what earlier tests changed, so the counter starts at zero for this dish
    await publishPost(jsonReq(`${URL0}/x`, {}, 'POST', write(marta)), { params: Promise.resolve({ slug: 'halka' }) });
    const n0 = await preview();
    const g0 = await guestScores();
    const current = (await stored()).dish.profile;
    const next = { ...dishScales(current), intensity: current.intensity >= 3 ? 0 : 5, fat: current.fat >= 3 ? 0 : 5, acidity: current.acidity >= 3 ? 0 : 5 };
    const r = await dishProfilePut(jsonReq(`${URL0}/x?restaurant=halka`, { profile: next, confirm: true }, 'PUT', write(marta, { 'if-match': `"${profileVersion(current)}"` })), ctxDish());
    expect(r.status).toBe(200);
    expect(await preview()).toBe(n0 + 1);
    expect(await guestScores()).toEqual(g0);
    expect((await publishPost(jsonReq(`${URL0}/x`, {}, 'POST', write(marta)), { params: Promise.resolve({ slug: 'halka' }) })).status).toBe(201);
    expect(await guestScores()).not.toEqual(g0);
  });
});
