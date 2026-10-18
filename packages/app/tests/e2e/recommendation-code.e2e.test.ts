import { queryDatabase } from '@wine-match/testkit';
import { describe, expect, inject, it } from 'vitest';

/**
 * The recommendation code on G8, on the built app and PostgreSQL (spec 2026-10-16-recommendation-code, phase 1:
 * AC5, AC6, AC14). Without JavaScript a browser only loads HTML and follows links: plain requests with a phone's user
 * agent do exactly that. These tests never send the synthetic-traffic header except where they test it.
 */

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CODE = /data-recommendation-code="([A-Z0-9]{3,4})"/;

interface Row { code: string; session_id: string; source: string; context: string; wine_id: string; dish_ids: string[]; serving: string; menu_version: Date | null; tier: string | null }

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${inject('e2e').baseUrl}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': 'en', ...headers }, redirect: 'manual' });
  return { res, html: (await res.text()).replace(/&amp;/g, '&') };
}

const rowsOf = (sid: string) => queryDatabase<Row>(inject('e2e').databaseUrl,
  'select code, session_id::text, source, context, wine_id::text, dish_ids, serving, menu_version, tier from recommendation_code where session_id = $1 order by issued_at', [sid]);
/** The form of G7 submitted the way a browser without JavaScript does: action + its hidden fields + the serving. */
const submitWine = (html: string, serving: 'glass' | 'bottle') => {
  const form = /<form [^>]*action="(\/r\/halka\/selected\/[^"]+)"[^>]*>([\s\S]*?)<\/form>/.exec(html)!;
  const fields = new URLSearchParams([...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  fields.set('serving', serving);
  return `${form[1]}?${fields}`;
};
const sidIn = (html: string) => /[?&]sid=([0-9a-f-]{36})/.exec(html)?.[1] ?? '';

describe('the recommendation code on G8 without JavaScript (AC5, AC6, AC14)', () => {
  it('dish → wine → "Choose this wine": G8 shows a code, stores one row, keeps the code on refresh', async () => {
    const menu = await get('/r/halka/menu');
    const sid = sidIn(menu.html);
    const dishHref = /href="(\/r\/halka\/dish\/[^"]+\/wines\?[^"]*)"/.exec(menu.html)![1];
    const dishId = /\/dish\/([^/]+)\/wines/.exec(dishHref)![1];
    const wineHref = /href="(\/r\/halka\/wine\/[^"]+\?[^"]*)"/.exec((await get(dishHref)).html)![1];
    const selectHref = submitWine((await get(wineHref)).html, 'bottle');
    expect(selectHref).toContain(`sid=${sid}`);

    const selected = await get(selectHref);
    expect(selected.res.status).toBe(200);
    const code = CODE.exec(selected.html)?.[1];
    expect(code).toMatch(/^[ACDEFGHJKLMNPRTUVWXY][2-9][ACDEFGHJKLMNPRTUVWXY]$/);
    expect(selected.html).toContain('Code for your waiter');
    // AC14: a code is per session and must never be stored by a proxy or a CDN
    expect(selected.res.headers.get('cache-control')).toContain('no-store');
    expect(selected.res.headers.get('set-cookie')).toBeNull();

    const rows = await rowsOf(sid);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code, session_id: sid, source: 'guest', context: 'dish', dish_ids: [dishId], serving: 'bottle' });
    expect(rows[0].menu_version).not.toBeNull();

    const again = await get(selectHref);
    expect(CODE.exec(again.html)?.[1]).toBe(code);
    expect(await rowsOf(sid)).toHaveLength(1);
  });

  it('a wine without a dish is a direct choice; table ids of another restaurant or not on the menu are dropped (AC5)', async () => {
    const sid = '2b7c1d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
    const [{ id: wine }] = await queryDatabase<{ id: string }>(inject('e2e').databaseUrl,
      "select w.id::text from wine w join restaurant r on r.id = w.restaurant_id where r.slug = 'halka' and w.active and w.deleted_at is null order by w.id limit 1");
    const direct = await get(`/r/halka/selected/${wine}?sid=${sid}`);
    expect(CODE.exec(direct.html)?.[1]).toBeTruthy();
    const foreign = '00000000-0000-4000-8000-0000000000aa';
    await get(`/r/halka/selected/${wine}?table=${foreign},not-a-uuid&serving=bottle&sid=${sid}`);
    const rows = await rowsOf(sid);
    expect(rows.map((r) => [r.context, r.dish_ids])).toEqual([['direct', []]]);
  });

  it('an inactive wine, a 404 and our synthetic traffic issue no code (AC6)', async () => {
    const sid = '3c8d2e4f-5a6b-4c7d-9e8f-0a1b2c3d4e5f';
    const [{ id: inactive }] = await queryDatabase<{ id: string }>(inject('e2e').databaseUrl,
      "select w.id::text from wine w join restaurant r on r.id = w.restaurant_id where r.slug = 'halka' and not w.active limit 1");
    const gone = await get(`/r/halka/selected/${inactive}?sid=${sid}`);
    expect(gone.res.status).toBe(200);
    expect(gone.html).not.toContain('data-recommendation-code');
    expect((await get(`/r/halka/selected/00000000-0000-4000-8000-0000000000ff?sid=${sid}`)).res.status).toBe(404);
    const [{ id: wine }] = await queryDatabase<{ id: string }>(inject('e2e').databaseUrl,
      "select w.id::text from wine w join restaurant r on r.id = w.restaurant_id where r.slug = 'halka' and w.active and w.deleted_at is null order by w.id limit 1");
    const synthetic = await get(`/r/halka/selected/${wine}?sid=${sid}`, { 'x-wine-match-synthetic': '1' });
    expect(synthetic.res.status).toBe(200);
    expect(synthetic.html).toContain('data-recommendation-code="none"');
    expect(await rowsOf(sid)).toEqual([]);
  });
});
