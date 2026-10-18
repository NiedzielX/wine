import { serviceDay, type RecommendationCodeInput, type RecommendationCodeRepository, type RecommendationCodeService } from '@wine-match/core';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { markCode } from '@/app/(guest)/r/[slug]/staff/actions';
import StaffPage from '@/app/(guest)/r/[slug]/staff/page';
import { createRequestScope } from '@/server/container';
import { logger } from '@/server/logger';

/**
 * Spec 2026-10-16-recommendation-code, phase 2: "Order from a code" on G9 (R6, AC7, AC8) and the public action
 * `markCode` (R7, Q7, Q8, AC15) — the page rendered to HTML and the action called the way Next.js calls it, on the
 * in-memory data source.
 */

/** Every `revalidatePath` call of the action (the shared setup only stubs it out). */
const revalidated = vi.hoisted(() => [] as Array<[string, string | undefined]>);
vi.mock('next/cache', () => ({ revalidatePath: (path: string, type?: string) => { revalidated.push([path, type]); } }));

type Next = { headers: Map<string, string>; afterTasks: Array<Promise<unknown>>; RedirectSignal: new (u: string) => Error & { url: string } };
const next = () => (globalThis as unknown as { __wmNext: Next }).__wmNext;
type Page = FunctionComponent<{ params: Promise<Record<string, string>>; searchParams: Promise<Record<string, string>> }>;

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const SID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER_RESTAURANT = '00000000-0000-4000-8000-00000000beef';

function setHeaders(extra: Record<string, string> = {}, lang = 'en') {
  next().headers.clear();
  next().headers.set('x-wine-lang', lang);
  next().headers.set('user-agent', SAFARI);
  for (const [k, v] of Object.entries(extra)) next().headers.set(k, v);
}

async function g9(search: Record<string, string>, lang: 'en' | 'pl' = 'en'): Promise<string> {
  setHeaders({}, lang);
  const { prelude } = await prerender(createElement(StaffPage as Page, { params: Promise.resolve({ slug: 'halka' }), searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '').replace(/&#x27;/g, '\'');
}
/** The text a reader sees, without tags. */
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** The "Order from a code" section of the page. */
const section = (html: string) => {
  const at = html.indexOf('data-staff-code');
  return at < 0 ? '' : html.slice(at, html.indexOf('</section>', at));
};
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

/** Runs the action with these request headers and returns the address it redirected to. */
async function post(fields: Record<string, string>, headers: Record<string, string> = {}): Promise<string> {
  setHeaders(headers);
  try {
    await markCode(form(fields));
  } catch (e) {
    if (e instanceof next().RedirectSignal) return e.url;
    throw e;
  }
  throw new Error('expected a redirect');
}

let service: RecommendationCodeService;
let repo: RecommendationCodeRepository;
let restaurantId = '';
let duck = { id: '', name: '' };
let menuDishes: Array<{ id: string; name: string }> = [];
let wine = { id: '', title: '', bottleSize: 0 };

const today = () => serviceDay(new Date());
const yesterday = () => serviceDay(new Date(Date.now() - 86_400_000));
let n = 0;
/** A recommendation stored directly (for the cases the guest pages cannot produce: yesterday, another restaurant, a dish gone). */
async function store(over: Partial<RecommendationCodeInput>, restaurant = restaurantId): Promise<string> {
  const code = over.code!;
  const r = await repo.tryIssue(restaurant, {
    id: `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`, code, serviceDay: today(), sessionId: crypto.randomUUID(), source: 'guest', context: 'dish',
    wineId: wine.id, dishIds: [duck.id], serving: 'bottle', menuVersion: null, tier: null, engineVersion: 'wm-test', issuedAt: new Date().toISOString(), ...over
  });
  expect(r.status).toBe('created');
  return code;
}
/** A fresh code issued the way G8 issues it. */
async function issue(dishIds: string[] = [duck.id], sid = crypto.randomUUID()): Promise<string> {
  const issued = await service.issue('halka', { session: { id: sid, isNew: false, source: 'link' }, source: 'guest', wineId: wine.id, serving: 'bottle', dishIds });
  return issued!.code;
}

beforeAll(async () => {
  const c = (await createRequestScope()).cradle;
  service = c.recommendationCodeService;
  repo = c.recommendationCodeRepository;
  const menu = (await c.catalogService.publishedMenu('halka'))!;
  restaurantId = menu.restaurant.id;
  menuDishes = menu.dishes;
  duck = menu.dishes.find((d) => d.name === 'Duck breast')!;
  const w = (await c.wineRepository.listByRestaurant(restaurantId)).find((x) => x.active && x.listNumber !== undefined)!;
  wine = { id: w.id, title: `${w.producer} ${w.name}`, bottleSize: w.bottleSize };
});

afterEach(async () => {
  await Promise.all(next().afterTasks.splice(0));
  revalidated.length = 0;
  vi.restoreAllMocks();
});

describe('G9: "Order from a code" (R6, AC7, AC8)', () => {
  it('without a code: a GET form for the code that carries the staff session and the language, above the dish choice', async () => {
    const html = await g9({ sid: SID, lang: 'pl' }, 'pl');
    const s = section(html);
    expect(s).toContain('Zamówienie z kodu');
    expect(s).toMatch(/<form [^>]*action="\/r\/halka\/staff" method="get"/);
    expect(s).toContain(`<input type="hidden" name="sid" value="${SID}"/>`);
    expect(s).toContain('<input type="hidden" name="lang" value="pl"/>');
    expect(s).toMatch(/<input id="staff-code" maxLength="16"[^>]* name="code" value=""\/>/);
    expect(s).not.toContain('role="status"');
    expect(html.indexOf('data-staff-code')).toBeLessThan(html.indexOf('id="staff-dish"'));
    // the one "i" of G9 also explains the code (E07 + E09)
    expect(text(html)).toContain('„Zamówienie z kodu”: wpisz kod z ekranu gościa i oznacz wino jako zamówione (można cofnąć). Działają tylko dzisiejsze kody.');
    expect(html.match(/data-explain="/g)).toHaveLength(1);
  });

  it('a code of today shows the wine, the serving, the dish, the time and "Ordered" with the hidden fields of the action', async () => {
    const code = await issue();
    const html = await g9({ code: ` ${code.toLowerCase()} `, sid: SID });
    const s = section(html);
    expect(s).toContain(`data-code-card="${code}"`);
    expect(s).toContain('data-confirmed="false"');
    const t = text(s);
    expect(t).toContain(wine.title);
    expect(t).toContain(`1 bottle, ${wine.bottleSize} ml`);
    expect(t).toContain(`Dish: ${duck.name}`);
    expect(t).toMatch(new RegExp(`Code ${code}, shown at \\d{2}:\\d{2}`));
    expect(s).toMatch(new RegExp(`<input id="staff-code"[^>]* name="code" value="${code}"/>`));
    // one POST form: slug, the normalised code, the intent, the staff session; no "not found"
    expect(s).toContain('<input type="hidden" name="slug" value="halka"/>');
    expect(s).toContain(`<input type="hidden" name="code" value="${code}"/>`);
    expect(s).toContain('<input type="hidden" name="intent" value="confirm"/>');
    expect(s.match(new RegExp(`name="sid" value="${SID}"`, 'g'))).toHaveLength(2);
    expect(s).toMatch(/<button type="submit"[^>]*>Ordered<\/button>/);
    expect(t).not.toContain('There is no code');
  });

  it('an unknown, malformed, foreign or yesterday\'s code gives one sentence and nothing else (R6, AC8)', async () => {
    const yesterdays = await store({ code: 'C3C', serviceDay: yesterday() });
    const foreign = await store({ code: 'D4D' }, OTHER_RESTAURANT);
    const answers: string[] = [];
    for (const code of ['X9X', yesterdays, foreign]) {
      const s = section(await g9({ code, sid: SID }));
      expect(s).not.toContain('data-code-card');
      expect(s).toContain('role="status"');
      answers.push(text(s).replace(code, '…'));
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain('There is no code … today in this restaurant. Check the characters on the guest’s screen.');
    // a malformed code: the same sentence with what was typed, and no lookup by a code that cannot exist
    const s = section(await g9({ code: 'W1K', sid: SID }));
    expect(text(s)).toContain('There is no code W1K today in this restaurant.');
    const pl = section(await g9({ code: 'X9X', sid: SID, lang: 'pl' }, 'pl'));
    expect(text(pl)).toContain('Nie ma dziś kodu X9X w tej restauracji. Sprawdź znaki z ekranu gościa.');
  });

  it('a table and a dish no longer on the menu: dishes in menu order, the missing one named as such (AC8)', async () => {
    const gone = '00000000-0000-4000-8000-0000000000dd';
    const [a, b] = [menuDishes[0], menuDishes[1]];
    const table = await store({ code: 'E5E', context: 'table', dishIds: [b.id, gone, a.id].sort() });
    const t = text(section(await g9({ code: table, sid: SID })));
    expect(t).toContain(`For the table: ${a.name}, ${b.name}, Dish not on the current menu`);
    const single = await store({ code: 'F6F', dishIds: [gone] });
    expect(text(section(await g9({ code: single, sid: SID, lang: 'pl' }, 'pl')))).toContain('Danie: Danie spoza obecnej karty');
    const direct = await store({ code: 'G7G', context: 'direct', dishIds: [] });
    expect(text(section(await g9({ code: direct, sid: SID })))).toContain('Chosen without a dish');
  });
});

describe('markCode: "Ordered" / "Undo" (R7, Q7, AC7, AC15)', () => {
  const fields = (code: string, intent: 'confirm' | 'undo', extra: Record<string, string> = {}) => ({ slug: 'halka', code, intent, sid: SID, lang: 'pl', ...extra });
  const stateOf = async (code: string, day = today()) => (await repo.findByCode(restaurantId, day, code))?.confirmedAt ?? null;

  it('confirms once (a double click keeps the first time), shows it on G9, and undoes it', async () => {
    const code = await issue();
    const back = await post(fields(code.toLowerCase(), 'confirm'));
    expect(back).toBe(`/r/halka/staff?code=${code}&marked=confirmed&lang=pl&sid=${SID}`);
    expect(revalidated).toEqual([['/r/halka/staff', 'layout']]);
    const first = await stateOf(code);
    expect(first).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    expect(await post(fields(code, 'confirm'))).toContain('marked=confirmed');
    expect(await stateOf(code)).toBe(first);

    const after = section(await g9({ code, marked: 'confirmed', sid: SID, lang: 'pl' }, 'pl'));
    expect(after).toContain('data-confirmed="true"');
    expect(text(after)).toMatch(/Oznaczone o \d{2}:\d{2}/);
    expect(text(after)).toContain('Oznaczono jako zamówione.');
    expect(after).toContain('role="status"');
    expect(after).toContain('<input type="hidden" name="intent" value="undo"/>');
    expect(after).toMatch(/<button type="submit"[^>]*>Cofnij<\/button>/);

    expect(await post(fields(code, 'undo'))).toBe(`/r/halka/staff?code=${code}&marked=undone&lang=pl&sid=${SID}`);
    expect(await stateOf(code)).toBeNull();
    expect(text(section(await g9({ code, marked: 'undone', sid: SID })))).toContain('Mark removed.');
  });

  it('unknown, foreign and yesterday\'s codes: codeError=not_found and no change (AC8)', async () => {
    const yesterdays = await store({ code: 'H8H', serviceDay: yesterday() });
    await repo.setConfirmed(restaurantId, yesterday(), yesterdays, new Date(Date.now() - 86_400_000), 'staff_view');
    const before = await stateOf(yesterdays, yesterday());
    expect(await post(fields(yesterdays, 'undo'))).toBe(`/r/halka/staff?code=${yesterdays}&codeError=not_found&lang=pl&sid=${SID}`);
    expect(await stateOf(yesterdays, yesterday())).toBe(before);
    const foreign = await store({ code: 'J9J' }, OTHER_RESTAURANT);
    expect(await post(fields(foreign, 'confirm'))).toContain('codeError=not_found');
    expect((await repo.findByCode(OTHER_RESTAURANT, today(), foreign))?.confirmedAt).toBeNull();
    expect(await post(fields('W1K', 'confirm'))).toBe(`/r/halka/staff?code=W1K&codeError=not_found&lang=pl&sid=${SID}`);
  });

  it('refuses a request the browser marks cross-site: no change, back to the code without a result (AC15)', async () => {
    const code = await issue();
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(await post(fields(code, 'confirm'), { 'sec-fetch-site': 'cross-site' })).toBe(`/r/halka/staff?code=${code}&lang=pl&sid=${SID}`);
    expect(await stateOf(code)).toBeNull();
    expect(revalidated).toEqual([]);
    expect(warn).toHaveBeenCalledWith('recommendation code action refused', { slug: 'halka', reason: 'cross-site' });
    // same-origin and same-site requests are the staff view's own forms
    expect(await post(fields(code, 'confirm'), { 'sec-fetch-site': 'same-origin' })).toContain('marked=confirmed');
    expect(await stateOf(code)).not.toBeNull();
  });

  it('builds the redirect from trusted parts only: no open redirect, no foreign sid or language (Q8)', async () => {
    const code = await issue();
    // a slug that is not a slug never becomes an address
    for (const slug of ['//evil.example', 'https://evil.example', '../admin', '']) expect(await post({ ...fields(code, 'confirm'), slug })).toBe('/');
    expect(await stateOf(code)).toBeNull();
    // a malformed sid or language is dropped, a missing intent is the "not found" answer of a valid slug
    expect(await post(fields(code, 'confirm', { sid: 'not-a-session', lang: 'de' }))).toBe(`/r/halka/staff?code=${code}&marked=confirmed`);
    expect(await post({ slug: 'halka', code })).toBe('/r/halka/staff?codeError=not_found');
    expect(await post({ ...fields(code, 'confirm'), intent: 'delete' })).toBe('/r/halka/staff?codeError=not_found');
    expect(await stateOf(code)).not.toBeNull();
  });
});
