import { AgentBrowser, queryDatabase } from '@wine-match/testkit';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { e2eSuite } from './support';

/**
 * "Order from a code" on G9, on the built app and PostgreSQL (spec 2026-10-16-recommendation-code, phase 2: AC7, AC8,
 * AC15). Without JavaScript a browser loads HTML, follows links and posts forms: plain requests with a phone's user agent
 * do exactly that — the "Ordered" / "Undo" form is posted as multipart with its hidden fields (the server action id
 * among them) and the site's own `Origin`, as a browser does. A second suite clicks through it in a browser whose
 * scripts never run (lesson e2e-without-javascript).
 */

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CODE = /data-recommendation-code="([A-Z0-9]{3,4})"/;
const base = () => inject('e2e').baseUrl;
const db = () => inject('e2e').databaseUrl;

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base()}${path}`, { headers: { 'user-agent': SAFARI, 'accept-language': 'en', ...headers }, redirect: 'manual' });
  return { res, html: (await res.text()).replace(/&amp;/g, '&').replace(/<!-- -->/g, '') };
}
/** The "Order from a code" section of G9. */
const section = (html: string) => {
  const at = html.indexOf('data-staff-code');
  return at < 0 ? '' : html.slice(at, html.indexOf('</section>', at));
};
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** The hidden fields of the section's POST form: the server action id, slug, code, intent, sid, lang. */
const postFields = (html: string): Array<[string, string]> => {
  const form = /<form[^>]*method="POST"[^>]*>([\s\S]*?)<\/form>/.exec(section(html));
  expect(form, 'the POST form of G9').not.toBeNull();
  return [...form![1].matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?/g)].map((m) => [m[1], m[2] ?? '']);
};
/** Posts the form as a browser without JavaScript does: multipart, the site's Origin, no redirect followed. */
async function post(page: string, fields: Array<[string, string]>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of fields) body.append(k, v);
  const res = await fetch(`${base()}${page}`, { method: 'POST', body, headers: { 'user-agent': SAFARI, origin: base(), 'sec-fetch-site': 'same-origin', ...headers }, redirect: 'manual' });
  await res.arrayBuffer();
  return res;
}
const withField = (fields: Array<[string, string]>, name: string, value: string) => fields.map(([k, v]): [string, string] => [k, k === name ? value : v]);

type Row = { confirmed_at: Date | null; confirmed_by: string | null; service_day: string };
const rowOf = async (code: string, day?: string): Promise<Row | undefined> => (await queryDatabase<Row>(db(),
  `select c.confirmed_at, c.confirmed_by, c.service_day::text from recommendation_code c join restaurant r on r.id = c.restaurant_id
    where r.slug = 'halka' and c.code = $1 ${day ? 'and c.service_day = $2::date' : 'order by c.service_day desc'} limit 1`, day ? [code, day] : [code]))[0];

/** A fresh code issued by G8 for a wine opened without a dish (a new guest session each time). */
async function issueCode(): Promise<{ code: string; day: string }> {
  const [{ id }] = await queryDatabase<{ id: string }>(db(),
    "select w.id::text from wine w join restaurant r on r.id = w.restaurant_id where r.slug = 'halka' and w.active and w.deleted_at is null order by w.id limit 1");
  const g8 = await get(`/r/halka/selected/${id}?serving=bottle&sid=${crypto.randomUUID()}`);
  const code = CODE.exec(g8.html)?.[1];
  expect(code).toBeTruthy();
  return { code: code!, day: (await rowOf(code!))!.service_day };
}
const STAFF_SID = '4d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d';

describe('G9 "Order from a code" without JavaScript (AC7, AC8, AC15)', () => {
  it('code of today → wine → "Ordered" → a double post keeps the first time → "Undo"; no cookie anywhere', async () => {
    const { code, day } = await issueCode();
    const page = `/r/halka/staff?code=${code.toLowerCase()}&sid=${STAFF_SID}`;
    const g9 = await get(page);
    expect(g9.res.status).toBe(200);
    expect(g9.res.headers.get('set-cookie')).toBeNull();
    const s = section(g9.html);
    expect(s).toContain(`data-code-card="${code}"`);
    expect(text(s)).toMatch(/1 bottle, \d+ ml/);
    expect(text(s)).toMatch(new RegExp(`Code ${code}, shown at \\d{2}:\\d{2}`));
    const fields = postFields(g9.html);
    expect(fields.map(([k]) => k).filter((k) => !k.startsWith('$ACTION_ID_'))).toEqual(['slug', 'code', 'intent', 'sid']);
    expect(fields).toContainEqual(['intent', 'confirm']);

    const first = await post(page, fields);
    expect(first.status).toBe(303);
    expect(first.headers.get('location')).toBe(`/r/halka/staff?code=${code}&marked=confirmed&sid=${STAFF_SID}`);
    expect(first.headers.get('set-cookie')).toBeNull();
    const confirmed = await rowOf(code, day);
    expect(confirmed?.confirmed_at).not.toBeNull();
    expect(confirmed?.confirmed_by).toBe('staff_view');

    // the same form posted again (a double tap, or the back button): the first time stays
    await new Promise((r) => setTimeout(r, 20));
    expect((await post(page, fields)).headers.get('location')).toContain('marked=confirmed');
    expect((await rowOf(code, day))?.confirmed_at?.getTime()).toBe(confirmed!.confirmed_at!.getTime());

    const after = await get(first.headers.get('location')!);
    expect(after.res.headers.get('set-cookie')).toBeNull();
    expect(text(section(after.html))).toMatch(/Marked at \d{2}:\d{2}/);
    expect(section(after.html)).toMatch(/role="status"[^>]*>Marked as ordered\.</);
    const undo = postFields(after.html);
    expect(undo).toContainEqual(['intent', 'undo']);
    const undone = await post(`/r/halka/staff?code=${code}&marked=confirmed&sid=${STAFF_SID}`, undo);
    expect(undone.headers.get('location')).toBe(`/r/halka/staff?code=${code}&marked=undone&sid=${STAFF_SID}`);
    expect(await rowOf(code, day)).toMatchObject({ confirmed_at: null, confirmed_by: null });
  });

  it('Polish: the same path with the language kept in every form and redirect', async () => {
    const { code, day } = await issueCode();
    const page = `/r/halka/staff?code=${code}&lang=pl&sid=${STAFF_SID}`;
    const g9 = await get(page, { 'accept-language': 'pl' });
    expect(section(g9.html)).toContain('Zamówienie z kodu');
    expect(section(g9.html)).toMatch(/<button type="submit"[^>]*>Zamówione<\/button>/);
    const res = await post(page, postFields(g9.html));
    expect(res.headers.get('location')).toBe(`/r/halka/staff?code=${code}&marked=confirmed&lang=pl&sid=${STAFF_SID}`);
    const after = await get(res.headers.get('location')!, { 'accept-language': 'pl' });
    expect(text(section(after.html))).toMatch(/Oznaczone o \d{2}:\d{2}/);
    expect(section(after.html)).toMatch(/<button type="submit"[^>]*>Cofnij<\/button>/);
    expect((await rowOf(code, day))?.confirmed_at).not.toBeNull();
  });

  it('an unknown, malformed or yesterday\'s code: the same sentence and the same status; a post changes nothing (AC8)', async () => {
    const { code, day } = await issueCode();
    // the same recommendation moved to yesterday: G9 must not tell that it existed
    const [{ y }] = await queryDatabase<{ y: string }>(db(), "select ($1::date - 1)::text as y", [day]);
    await queryDatabase(db(), "update recommendation_code set service_day = $2::date where code = $1 and service_day = $3::date and restaurant_id = (select id from restaurant where slug = 'halka')", [code, y, day]);
    const answers: string[] = [];
    for (const typed of [code, 'X9X', 'W1K']) {
      const g9 = await get(`/r/halka/staff?code=${typed}&sid=${STAFF_SID}`);
      expect(g9.res.status).toBe(200);
      expect(section(g9.html)).not.toContain('data-code-card');
      answers.push(text(section(g9.html)).replaceAll(typed, '…'));
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain('There is no code … today in this restaurant. Check the characters on the guest’s screen.');

    // a form of today's code, replayed with yesterday's: not found, the row unchanged
    const fresh = await issueCode();
    const fields = postFields((await get(`/r/halka/staff?code=${fresh.code}&sid=${STAFF_SID}`)).html);
    const res = await post(`/r/halka/staff?code=${fresh.code}&sid=${STAFF_SID}`, withField(fields, 'code', code));
    expect(res.headers.get('location')).toBe(`/r/halka/staff?code=${code}&codeError=not_found&sid=${STAFF_SID}`);
    expect(await rowOf(code, y)).toMatchObject({ confirmed_at: null });
    expect(await rowOf(fresh.code, fresh.day)).toMatchObject({ confirmed_at: null });
  });

  it('a post the browser marks cross-site, or from a foreign origin, changes nothing (AC15)', async () => {
    const { code, day } = await issueCode();
    const page = `/r/halka/staff?code=${code}&sid=${STAFF_SID}`;
    const fields = postFields((await get(page)).html);
    const crossSite = await post(page, fields, { 'sec-fetch-site': 'cross-site' });
    expect(crossSite.headers.get('location')).toBe(`/r/halka/staff?code=${code}&sid=${STAFF_SID}`);
    expect((await rowOf(code, day))?.confirmed_at).toBeNull();
    const foreign = await post(page, fields, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
    expect(foreign.status).not.toBe(303);
    expect((await rowOf(code, day))?.confirmed_at).toBeNull();
    // control: the very same form from the site itself is accepted
    expect((await post(page, fields)).headers.get('location')).toContain('marked=confirmed');
    expect((await rowOf(code, day))?.confirmed_at).not.toBeNull();
  });
});

describe('G9 "Order from a code" in a browser without JavaScript: 390 and 1440 px', () => {
  const { browser } = e2eSuite('staff-code');
  const evalJs = async (js: string) => JSON.parse((await browser.run('eval', js)).trim()) as unknown;
  const press = (label: string) => evalJs(`(() => { const b = [...document.querySelectorAll('[data-staff-code] button')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  /**
   * The page text once it shows `text`. A native form post replaces the document: while the new page loads, reading
   * `body` fails ("Element not found"), so a failed read is retried like a page without the text yet.
   */
  async function waitText(text: string, timeoutMs = 15_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let last: unknown;
    while (Date.now() < deadline) {
      try {
        return await browser.waitForPageText(text, Math.min(2_000, Math.max(deadline - Date.now(), 1)));
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw last;
  }

  beforeAll(async () => {
    await AgentBrowser.verifyVersion();
    // no script of the app ever runs in this session: the route is set before the first page (lesson e2e-without-javascript)
    await browser.open('about:blank');
    await browser.run('network', 'route', '**/*.js', '--abort');
    await browser.run('set', 'viewport', '390', '844');
  });
  afterAll(async () => {
    await browser.close();
  });

  it('type the code, Find, Ordered, Undo — native forms only, no sideways scroll', async () => {
    const { code, day } = await issueCode();
    await browser.open(`${base()}/r/halka/staff?lang=en`);
    await waitText('Order from a code');
    expect(await evalJs('typeof window.next === "object" && !!window.next?.router')).toBe(false);
    await browser.fill('#staff-code', ` ${code.toLowerCase()} `);
    expect(await press('Find')).toBe(true);
    await waitText(`Code ${code}, shown at`);
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    expect(await press('Ordered')).toBe(true);
    await waitText('Marked as ordered.');
    expect((await rowOf(code, day))?.confirmed_at).not.toBeNull();
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    await browser.run('set', 'viewport', '1440', '900');
    await browser.run('reload');
    await waitText('Marked at');
    expect(await evalJs('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
    expect(await press('Undo')).toBe(true);
    await waitText('Mark removed.');
    expect((await rowOf(code, day))?.confirmed_at).toBeNull();
  });
});
