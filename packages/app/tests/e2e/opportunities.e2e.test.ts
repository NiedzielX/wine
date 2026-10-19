import { randomUUID } from 'node:crypto';
import { MIN_ORDERS, WINDOW_DAYS, kpiWindow, lastFullServiceDays, seedUsageEvents, type GuestInteractionInput } from '@wine-match/core';
import { closeOrm, getOrm, PgGuestInteractionRepository } from '@wine-match/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { e2eSuite } from './support';

/**
 * Spec 2026-10-16-sommelier-opportunities, phase 2 (AC7, AC8): A6 and A14 work WITHOUT JavaScript — every script
 * request of the session is aborted, so forms post natively and the server redirects. A7 lives in `(lists)` with a
 * `loading.tsx` (streams, needs JavaScript), so the new suggestion is checked there in a second session with scripts on.
 * Every change is undone at the end, so the other suites see the restaurant as seeded. Phase 4 (AC12): S5 from
 * recommendation codes stored straight in the database (confirming a code on G9 is E09 phase 2), then "Approve".
 * Phase 3 (AC11): S4 from usage events written through `seedUsageEvents` and `PgGuestInteractionRepository` in E04's
 * window, below and at the threshold, then "Open pairings" to the primary's row on A6.
 */

type ApiPairing = { id: string; dishId: string; wineId: string; status: string; role: string | null; version: number };

async function signIn(b: AgentBrowser, base: string, email: string) {
  await b.open(`${base}/admin/login`);
  await b.waitForPageText('Work e-mail');
  await b.fill('input[name=email]', email);
  await b.fill('input[name=password]', 'demo-halka-2026');
  await b.clickRole('button', 'Sign in');
  await b.waitForUrl('/admin/halka');
}

/**
 * Clicks the button with this text inside `scope` from outside the page (the page itself runs no script): a native
 * click on a submit button posts its form the way a browser without JavaScript does.
 */
async function clickButton(b: AgentBrowser, scope: string, text: string) {
  const clicked = await b.run('eval', `(() => { const btn = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!btn) return false; btn.click(); return true; })()`);
  expect(clicked.trim(), `button "${text}" in ${scope}`).toBe('true');
}

/** A JSON read inside the signed-in page (same origin, the session cookie goes along). */
async function readJson<T>(b: AgentBrowser, path: string): Promise<T> {
  const out = await b.run('eval', `fetch(${JSON.stringify(path)}).then((r) => r.text())`);
  const text = JSON.parse(out.trim()) as string;
  return JSON.parse(text) as T;
}

describe('opportunities without JavaScript (A6, A14)', () => {
  const { browser, baseUrl } = e2eSuite('opportunities');
  const withJs = new AgentBrowser(`wm-opportunities-js-${randomUUID().slice(0, 8)}`);
  const manager = new AgentBrowser(`wm-opportunities-gm-${randomUUID().slice(0, 8)}`);
  const undo: Array<() => Promise<void>> = [];
  let dishes: Array<{ id: string; name: string }> = [];

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    // this session never runs a script of the app: the route is set before the first page, so no chunk is ever cached
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await signIn(browser, baseUrl(), 'marta@halka.pl');
    const menu = await readJson<{ categories: Array<{ dishes: Array<{ id: string; name: string }> }> }>(browser, '/api/v1/public/restaurants/halka/menu');
    dishes = menu.categories.flatMap((c) => c.dishes);
  });

  afterAll(async () => {
    for (const step of undo.reverse()) await step().catch(() => undefined);
    await browser.close();
    await withJs.close();
    await manager.close();
  });

  const a6 = (dishId: string) => `${baseUrl()}/admin/halka/pairings/${dishId}`;
  const pairingsOf = (dishId: string) => readJson<{ data: ApiPairing[] }>(browser, `/api/v1/restaurants/halka/pairings?dishId=${dishId}`).then((r) => r.data);
  /** Posts the form of one pairing with this button (the server redirects back with ?saved=). */
  const press = (pairingId: string, button: string) => clickButton(browser, `form:has(input[name="pairingId"][value="${pairingId}"])`, button);

  it('the page has no script running: the explanation and the inbox are plain HTML', async () => {
    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    expect((await browser.run('eval', 'typeof window.next === "object" && !!window.next?.router')).trim()).toBe('false');
    expect(await browser.count('details[data-explain="opportunities"]')).toBe(1);
    expect(await browser.count('[data-opportunity]')).toBeGreaterThan(0);
  });

  it('rejecting the primary pick of a dish without suggestions shows S1 on A6 and in A14; Ignore and Restore', async () => {
    // the demo dishes all have suggestions or a primary pick: approve the dish's suggestions first, then reject its primary
    let target: { dish: { id: string; name: string }; primary: ApiPairing } | undefined;
    for (const dish of dishes.filter((d) => !['Beef tartare', 'Duck breast'].includes(d.name))) {
      const primary = (await pairingsOf(dish.id)).find((p) => p.role === 'primary' && (p.status === 'approved' || p.status === 'modified'));
      if (primary) { target = { dish, primary }; break; }
    }
    expect(target, 'a dish with a primary pick').toBeDefined();
    const { dish, primary } = target!;
    undo.push(async () => {
      // Restore makes it a suggestion again; Approve, then "Set role" primary puts it back first
      await browser.open(a6(dish.id));
      if ((await pairingsOf(dish.id)).find((p) => p.id === primary.id)?.status === 'rejected') { await press(primary.id, 'Restore as suggestion'); await browser.waitForUrl('saved=restored'); }
      if ((await pairingsOf(dish.id)).find((p) => p.id === primary.id)?.status === 'suggested') { await press(primary.id, 'Approve'); await browser.waitForUrl('saved=approved'); }
      if ((await pairingsOf(dish.id)).find((p) => p.id === primary.id)?.role !== 'primary') {
        await browser.run('eval', `document.querySelector('form:has(input[name="pairingId"][value="${primary.id}"]) select[name=role]').value = 'primary'`);
        await press(primary.id, 'Set role');
        await browser.waitForUrl('saved=role');
      }
    });

    await browser.open(a6(dish.id));
    await browser.waitForPageText('Approved for guests');
    if ((await pairingsOf(dish.id)).some((p) => p.status === 'suggested')) {
      await clickButton(browser, 'form:has(input[name="dishId"])', `Approve all ${(await pairingsOf(dish.id)).filter((p) => p.status === 'suggested').length}`);
      await browser.waitForUrl('saved=approved_all');
    }
    await press(primary.id, 'Reject');
    await browser.waitForUrl('saved=rejected');
    const page = await browser.waitForPageText('Opportunities for this dish');
    expect(page).toMatch(/This dish has (no approved pairing yet|approved pairings, but none of them is the Primary)\./);
    expect(await browser.count('[data-opportunity="dish_no_primary"]')).toBe(1);

    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText(dish.name);
    const s1 = `[data-opportunity="dish_no_primary"]:has(input[name="key"][value^="dish_no_primary:${dish.id}:"])`;
    expect(await browser.count(s1)).toBe(1);
    await clickButton(browser, s1, 'Ignore');
    await browser.waitForUrl('saved=opportunity_dismissed');
    await browser.waitForPageText('Opportunity ignored.');
    expect(await browser.count(s1)).toBe(0);
    expect(await browser.text('details:not([data-explain]) summary')).toMatch(/^Ignored \(\d+\)$/);
    await browser.click('details:not([data-explain]) summary');
    await clickButton(browser, `details:not([data-explain]) form:has(input[name="key"][value^="dish_no_primary:${dish.id}:"])`, 'Restore');
    await browser.waitForUrl('saved=opportunity_restored');
    await browser.waitForPageText('Opportunity restored.');
    expect(await browser.count(s1)).toBe(1);
  });

  it('"Add to suggestions" on A6 puts the wine among the engine suggestions, with no unpublished change; then Approve', async () => {
    const add = '[data-opportunity="wine_unpaired"], [data-opportunity="glass_match_unpaired"]';
    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    const dishId = (await browser.run('eval', `document.querySelector(${JSON.stringify(`:is(${add}) input[name="dishId"]`)}).value`)).trim().replace(/"/g, '');
    const wineId = (await browser.run('eval', `document.querySelector(${JSON.stringify(`:is(${add}) input[name="wineId"]`)}).value`)).trim().replace(/"/g, '');
    const publishBefore = await browser.run('eval', 'document.querySelector(\'a[href$="/publish"]\').textContent');

    await browser.open(a6(dishId));
    await browser.waitForPageText('Opportunities for this dish');
    await clickButton(browser, `[data-opportunity] form:has(input[name="wineId"][value="${wineId}"])`, 'Add to suggestions');
    await browser.waitForUrl('saved=suggestion_added');
    await browser.waitForPageText('Added to suggestions');
    const added = (await pairingsOf(dishId)).find((p) => p.wineId === wineId)!;
    expect(added.status).toBe('suggested');
    undo.push(async () => {
      await browser.open(a6(dishId));
      const now = (await pairingsOf(dishId)).find((p) => p.id === added.id);
      if (now?.status === 'suggested') await press(added.id, 'Reject');
      else if (now && now.status !== 'rejected') await press(added.id, 'Reject');
    });
    expect(await browser.count(`form:has(input[name="pairingId"][value="${added.id}"]) button`)).toBe(2);   // Approve, Reject
    expect(await browser.run('eval', 'document.querySelector(\'a[href$="/publish"]\').textContent')).toBe(publishBefore);

    // A7 streams (needs JavaScript): checked in a session with scripts on
    await signIn(withJs, baseUrl(), 'marta@halka.pl');
    await withJs.open(`${baseUrl()}/admin/halka/review`);
    await withJs.waitForPageText('Review queue');
    expect(await withJs.count(`input[name="pairingId"][value="${added.id}"]`)).toBeGreaterThan(0);

    await press(added.id, 'Approve');
    await browser.waitForUrl('saved=approved');
    expect((await pairingsOf(dishId)).find((p) => p.id === added.id)!.status).toBe('approved');
  });

  it('"Add to suggestions" from A14 stays on A14 with the message', async () => {
    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    const row = '[data-opportunity="wine_unpaired"], [data-opportunity="glass_match_unpaired"]';
    const dishId = (await browser.run('eval', `document.querySelector(${JSON.stringify(`:is(${row}) input[name="dishId"]`)}).value`)).trim().replace(/"/g, '');
    const wineId = (await browser.run('eval', `document.querySelector(${JSON.stringify(`:is(${row}) input[name="wineId"]`)}).value`)).trim().replace(/"/g, '');
    await clickButton(browser, `:is(${row}) form:has(input[name="wineId"][value="${wineId}"])`, 'Add to suggestions');
    expect(await browser.waitForUrl('saved=suggestion_added')).toContain('/admin/halka/opportunities');
    const added = (await pairingsOf(dishId)).find((p) => p.wineId === wineId)!;
    expect(added.status).toBe('suggested');
    undo.push(async () => {
      await browser.open(a6(dishId));
      await press(added.id, 'Reject');
    });
  });

  it('the general manager sees the opportunities without buttons (R7)', async () => {
    await signIn(manager, baseUrl(), 'tomasz@halka.pl');
    await manager.open(`${baseUrl()}/admin/halka/opportunities`);
    await manager.waitForPageText('View only');
    expect(await manager.count('[data-opportunity]')).toBeGreaterThan(0);
    expect(await manager.count('[data-opportunity] button')).toBe(0);
  });
});

describe('S5 without JavaScript: ordered with a recommendation code, then "Approve" (phase 4, AC12)', () => {
  const { browser, baseUrl } = e2eSuite('opportunities-s5');
  const codeIds: string[] = [];
  let pairing: ApiPairing | undefined;
  const db = () => inject('e2e').databaseUrl;
  const pairingsOf = (dishId: string) => readJson<{ data: ApiPairing[] }>(browser, `/api/v1/restaurants/halka/pairings?dishId=${dishId}`).then((r) => r.data);
  const press = (pairingId: string, button: string) => clickButton(browser, `form:has(input[name="pairingId"][value="${pairingId}"])`, button);

  beforeAll(async () => {
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await signIn(browser, baseUrl(), 'marta@halka.pl');
  });

  afterAll(async () => {
    // the pairing back to a suggestion (Reject, then Restore as suggestion), the codes out of the database
    if (pairing) {
      const dishId = pairing.dishId;
      const id = pairing.id;
      await (async () => {
        await browser.open(`${baseUrl()}/admin/halka/pairings/${dishId}`);
        if ((await pairingsOf(dishId)).find((p) => p.id === id)?.status !== 'suggested') {
          if ((await pairingsOf(dishId)).find((p) => p.id === id)?.status !== 'rejected') { await press(id, 'Reject'); await browser.waitForUrl('saved=rejected'); }
          await press(id, 'Restore as suggestion');
          await browser.waitForUrl('saved=restored');
        }
      })().catch(() => undefined);
    }
    if (codeIds.length) await queryDatabase(db(), 'delete from recommendation_code where id = any($1::uuid[])', [codeIds]);
    await browser.close();
  });

  it('five staff-confirmed codes for a suggested pair give S5 in A14; "Approve" posts the version and ends it', async () => {
    const [{ id: restaurantId }] = await queryDatabase<{ id: string }>(db(), "select id::text from restaurant where slug = 'halka'");
    const menu = await readJson<{ categories: Array<{ dishes: Array<{ id: string; name: string }> }> }>(browser, '/api/v1/public/restaurants/halka/menu');
    for (const dish of menu.categories.flatMap((c) => c.dishes)) {
      pairing = (await pairingsOf(dish.id)).find((p) => p.status === 'suggested');
      if (pairing) break;
    }
    expect(pairing, 'a suggested pairing of a published dish').toBeDefined();
    const { id: pairingId, dishId, wineId } = pairing!;

    // the last full service day is inside the 28-day window; orders = codes the waiter confirmed (E09 F1: no POS yet)
    const day = lastFullServiceDays(new Date(), WINDOW_DAYS).to;
    for (let i = 0; i < MIN_ORDERS; i++) {
      const id = randomUUID();
      codeIds.push(id);
      await queryDatabase(db(),
        `insert into recommendation_code (id, restaurant_id, service_day, code, session_id, source, context, wine_id, dish_ids, serving, engine_version, issued_at, confirmed_at)
         values ($1, $2, $3, $4, $5, 'guest', 'dish', $6, $7::jsonb, 'bottle', 'wm-e2e', now(), now())`,
        [id, restaurantId, day, `Y${9 - i}Y`, randomUUID(), wineId, JSON.stringify([dishId])]);
    }

    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    const row = `[data-opportunity="ordered_not_reviewed"]:has(input[name="pairingId"][value="${pairingId}"])`;
    expect(await browser.count(row)).toBe(1);
    expect(await browser.text(row)).toMatch(/was ordered with a recommendation code for this dish 5 times in the last 28 days, and this pairing isn’t approved\./);
    const version = (await browser.run('eval', `document.querySelector(${JSON.stringify(`${row} input[name="version"]`)}).value`)).trim().replace(/"/g, '');
    expect(version).toBe(String(pairing!.version));

    await clickButton(browser, row, 'Approve');
    expect(await browser.waitForUrl('saved=approved')).toContain('/admin/halka/opportunities');
    await browser.waitForPageText('What are opportunities?');
    expect(await browser.count(row)).toBe(0);
    expect((await pairingsOf(dishId)).find((p) => p.id === pairingId)!.status).toBe('approved');
  });
});

describe('S4 without JavaScript: the primary guests see often and choose rarely (phase 3, AC11)', () => {
  const { browser, baseUrl } = e2eSuite('opportunities-s4');
  const ENGINE = 'wm-e2e-e10-f3';
  const db = () => inject('e2e').databaseUrl;
  let n = 0;

  beforeAll(async () => {
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await signIn(browser, baseUrl(), 'marta@halka.pl');
  });

  afterAll(async () => {
    await queryDatabase(db(), 'delete from guest_interaction where engine_version = $1', [ENGINE]);
    await closeOrm();
    await browser.close();
  });

  it('29 views of the primary are silent; the 30th gives S4 with its numbers, and "Open pairings" lands on the pairing row of A6', async () => {
    const [{ id: restaurant }] = await queryDatabase<{ id: string }>(db(), "select id::text from restaurant where slug = 'halka'");
    // the approved primary pairing of a published dish with an active wine, and another active wine for "the others"
    const [pair] = await queryDatabase<{ id: string; dish: string; wine: string; dishName: string }>(db(),
      `select p.id::text as id, p.dish_id::text as dish, p.wine_id::text as wine, d.name as "dishName"
         from pairing p join dish d on d.id = p.dish_id join wine w on w.id = p.wine_id
        where p.restaurant_id = $1 and p.status in ('approved', 'modified') and p.role = 'primary' and d.status = 'published' and w.active
          and d.deleted_at is null and w.deleted_at is null
        order by d.name limit 1`, [restaurant]);
    const [{ id: other }] = await queryDatabase<{ id: string }>(db(),
      'select id::text from wine where restaurant_id = $1 and active and deleted_at is null and id <> $2 order by name limit 1', [restaurant, pair.wine]);

    // inside E04's window (the app itself records only "now", and today is outside it)
    const at = new Date(kpiWindow(new Date()).currentRange.from.getTime() + 3 * 86_400_000);
    const ev = (sessionId: string, name: GuestInteractionInput['name'], extra: Partial<GuestInteractionInput> = {}): GuestInteractionInput =>
      ({ sessionId, name, props: { menuVersion: null }, engineVersion: ENGINE, createdAt: at, ...extra });
    const sessions = (k: number, chosen: number, wineId: string, tier: string) => Array.from({ length: k }, (_, i) => {
      const s = `e1030000-0000-4000-9000-${String(++n).padStart(12, '0')}`;
      return [
        ev(s, 'guest_session_started', { props: { source: 'qr', menuVersion: null } }),
        ev(s, 'recommendations_viewed', { dishId: pair.dish, props: { wineIds: [wineId], items: [{ wineId, tier }], menuVersion: null } }),
        ...(i < chosen ? [ev(s, 'wine_selected', { dishId: pair.dish, wineId, props: { serving: 'glass', context: 'dish', menuVersion: null } })] : [])
      ];
    }).flat();
    const orm = await getOrm({ clientUrl: db(), pool: { min: 0, max: 2 } });
    const repo = new PgGuestInteractionRepository({ em: orm.em.fork() });
    const row = `[data-opportunity="shown_rarely_chosen"]:has(input[name="key"][value="shown_rarely_chosen:${pair.dish}:${pair.wine}"])`;

    // below the threshold: 29 views of the primary (2 chosen), 20 of another wine (5 chosen)
    await seedUsageEvents(repo, restaurant, [...sessions(29, 2, pair.wine, 'sommelier_primary'), ...sessions(20, 5, other, 'engine')]);
    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    expect((await browser.run('eval', 'typeof window.next === "object" && !!window.next?.router')).trim()).toBe('false');
    expect(await browser.count('[data-opportunity="shown_rarely_chosen"]')).toBe(0);

    // the 30th view: 2 of 30 (7%) against 5 of 20 (25%)
    await seedUsageEvents(new PgGuestInteractionRepository({ em: orm.em.fork() }), restaurant, sessions(1, 0, pair.wine, 'sommelier'));
    await browser.open(`${baseUrl()}/admin/halka/opportunities`);
    await browser.waitForPageText('What are opportunities?');
    expect(await browser.count(row)).toBe(1);
    expect(await browser.text(row)).toMatch(/When guests saw .+ with this dish \(30 times in the last 28 days\), they chose it 2 times \(7%\); they chose the other wines for this dish 25% of the time\./);
    const href = `/admin/halka/pairings/${pair.dish}#pairing-${pair.id}`;
    expect(await browser.count(`${row} a[href="${href}"]`)).toBe(1);

    // a plain link: it works without JavaScript and lands on the primary's row of A6
    await browser.run('eval', `document.querySelector(${JSON.stringify(`${row} a[href="${href}"]`)}).click()`);
    expect(await browser.waitForUrl(`#pairing-${pair.id}`)).toContain(`/admin/halka/pairings/${pair.dish}`);
    await browser.waitForPageText('Approved for guests');
    expect(await browser.count(`#pairing-${pair.id}`)).toBe(1);
    // A6 never shows S4 (scope "dish": no queries on the events)
    expect(await browser.count('[data-opportunity="shown_rarely_chosen"]')).toBe(0);
  });
});
