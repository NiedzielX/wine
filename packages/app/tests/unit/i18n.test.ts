import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { GET as recGet } from '@/app/api/v1/dishes/[dishId]/recommendations/route';
import { GET as menuGet } from '@/app/api/v1/public/restaurants/[slug]/menu/route';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { proxy, requestLocale } from '@/proxy';
import { guestContext, hrefWith, langHref } from '@/server/guest-page';
import { formatPrice, getDictionary, getI18n, getLocale } from '@/server/i18n';
import { DEFAULT_PREFS } from '@wine-match/core';
import { req } from './helpers';

const headers = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string> } }).__wmNext.headers;
const at = (url: string, init: { headers?: Record<string, string> } = {}) => new NextRequest(url, init);

describe('language of a request (proxy)', () => {
  it('?lang wins, then (dashboard only) the wm_lang cookie, then Accept-Language, then English', () => {
    expect(requestLocale(at('http://x/r/halka?lang=pl'))).toBe('pl');
    expect(requestLocale(at('http://x/r/halka?lang=en', { headers: { 'accept-language': 'pl-PL' } }))).toBe('en');
    expect(requestLocale(at('http://x/r/halka?lang=de', { headers: { 'accept-language': 'pl-PL' } }))).toBe('pl');
    expect(requestLocale(at('http://x/r/halka', { headers: { 'accept-language': 'en-GB' } }))).toBe('en');
    expect(requestLocale(at('http://x/r/halka'))).toBe('en');
    // guests never get a language from a cookie
    expect(requestLocale(at('http://x/r/halka', { headers: { cookie: 'wm_lang=pl' } }))).toBe('en');
    expect(requestLocale(at('http://x/admin/halka', { headers: { cookie: 'wm_lang=pl', 'accept-language': 'en' } }))).toBe('pl');
    expect(requestLocale(at('http://x/admin/halka', { headers: { cookie: 'wm_lang=xx', 'accept-language': 'pl' } }))).toBe('pl');
  });

  it('always overwrites x-wine-lang, so a client cannot choose it past the proxy', () => {
    const guest = proxy(at('http://x/r/halka', { headers: { 'accept-language': 'pl-PL', 'x-wine-lang': 'en' } }));
    expect(guest.headers.get('x-middleware-request-x-wine-lang')).toBe('pl');
    const admin = proxy(at('http://x/admin/halka', { headers: { 'x-wine-lang': 'pl' } }));
    expect(admin.headers.get('x-middleware-request-x-wine-lang')).toBe('en');
  });
});

describe('server i18n helpers', () => {
  beforeEach(() => headers().clear());

  it('reads the language the proxy set; anything else is English', async () => {
    expect(await getLocale()).toBe('en');
    headers().set('x-wine-lang', 'pl');
    expect(await getLocale()).toBe('pl');
    expect((await getI18n()).t).toBe(pl);
    headers().set('x-wine-lang', 'de');
    expect(await getLocale()).toBe('en');
    expect(getDictionary('en')).toBe(en);
  });

  it('formats prices for the language: NBSP-grouped in Polish, comma-grouped in English', () => {
    expect(formatPrice(1234, 'pl')).toBe('1 234 zł');
    expect(formatPrice(64, 'pl')).toBe('64 zł');
    expect(formatPrice(1234, 'en')).toBe('1,234 zł');
    expect(formatPrice(64, 'en')).toBe('64 zł');
  });

  it('the Polish dictionary has every key of the English one', () => {
    const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(pl).sort()).toEqual(keys(en).sort());
    expect(pl.guest.wines.show(1)).toBe('Pokaż 1 wino');
    expect(pl.guest.wines.show(3)).toBe('Pokaż 3 wina');
    expect(pl.guest.wines.show(5)).toBe('Pokaż 5 win');
    expect(pl.guest.wines.show(12)).toBe('Pokaż 12 win');
  });

  it('the waiter’s whole table (G11, spec whole-table-waiter-path R6, R12, AC10): the sentence to say and the fit line, in both languages', () => {
    for (const [t, line] of [[en, 'This bottle: No. 109 Radikon Slatnik.'], [pl, 'Ta butelka: nr 109 Radikon Slatnik.']] as const) {
      expect(t.guest.staffTable.thisBottle(109, 'Radikon Slatnik')).toBe(line);
      expect(t.guest.staffTable.thisBottle(undefined, 'Radikon Slatnik')).not.toMatch(/No\.|nr /);
    }
    // every shape of R12: all (3+), both, n of m (names after a colon, undeclined), none, one dish (both variants), compromise
    const f = (fits: number, of: number, weaker: string[] = [], compromise = false) => ({ fits, of, weaker, compromise });
    expect([f(3, 3), f(2, 2), f(5, 6, ['Comber z jelenia']), f(0, 4), f(1, 1), f(0, 1, ['Comber z jelenia']), f(4, 4, [], true), f(2, 6, ['A', 'B', 'C', 'D'])].map(pl.guest.tableFit.line)).toEqual([
      'Pasuje do wszystkich 3 dań.', 'Pasuje do obu dań.', 'Pasuje do 5 z 6 dań, słabiej do: Comber z jelenia.', 'Nie pasuje dobrze do żadnego z 4 dań.',
      'Pasuje do tego dania.', 'Słabiej pasuje do: Comber z jelenia.', 'Pasuje do wszystkich 4 dań, choć to kompromis.', 'Pasuje do 2 z 6 dań, słabiej do: A, B, C i 1 innego.'
    ]);
    expect(en.guest.tableFit.line(f(5, 6, ['Venison loin']))).toBe('Works with 5 of 6 dishes, less so with: Venison loin.');
    expect(pl.guest.staffTable.truncated(12)).toBe('Policzyliśmy pierwsze 12 dań.');
    expect(en.guest.staffTable.truncated(12)).toBe('We worked out the first 12 dishes.');
  });
});

describe('guest links carry an explicit language only', () => {
  beforeEach(() => headers().clear());

  const SID = '0b5e7a1c-1d2e-4f30-8a4b-5c6d7e8f9a0b';

  it('lang from the URL goes into every link, before the session (sid, last); a language from the browser does not', async () => {
    headers().set('x-wine-lang', 'pl');
    const browser = await guestContext(Promise.resolve({ serving: 'glass', sid: SID }));
    expect(browser.locale).toBe('pl');
    expect(browser.lang).toBeUndefined();
    expect(browser.href('/r/halka/menu', browser.prefs)).toBe(`/r/halka/menu?serving=glass&sid=${SID}`);
    headers().set('x-wine-lang', 'en');
    const chosen = await guestContext(Promise.resolve({ serving: 'glass', lang: 'en', sid: SID }));
    expect(chosen.lang).toBe('en');
    expect(chosen.href('/r/halka/menu', chosen.prefs, { dish: 'd1' })).toBe(`/r/halka/menu?dish=d1&serving=glass&lang=en&sid=${SID}`);
    expect(chosen.href('/r/halka')).toBe(`/r/halka?lang=en&sid=${SID}`);
    expect(hrefWith('/r/halka', DEFAULT_PREFS)).toBe('/r/halka');
    const junk = await guestContext(Promise.resolve({ lang: 'de' }));
    expect(junk.lang).toBeUndefined();
  });

  it('the language switch keeps the whole query, replaces lang and keeps (or starts) the session', async () => {
    expect(langHref('/r/halka/table/result', { dish: ['a', 'b'], lang: 'en', serving: 'bottle' }, 'pl')).toBe('/r/halka/table/result?dish=a&dish=b&serving=bottle&lang=pl');
    expect(langHref('/r/halka', {}, 'en')).toBe('/r/halka?lang=en');
    expect(langHref('/r/halka', { sid: 'old', serving: 'glass' }, 'en', SID)).toBe(`/r/halka?serving=glass&lang=en&sid=${SID}`);
    const ctx = await guestContext(Promise.resolve({ styles: 'red,white', sid: SID }));
    expect(ctx.langHrefs('/r/halka')).toEqual({ pl: `/r/halka?styles=red%2Cwhite&lang=pl&sid=${SID}`, en: `/r/halka?styles=red%2Cwhite&lang=en&sid=${SID}` });
    const fresh = await guestContext(Promise.resolve({}));
    expect(fresh.session.isNew).toBe(true);
    expect(fresh.langHrefs('/r/halka').en).toBe(`/r/halka?lang=en&sid=${fresh.session.id}`);
  });
});

describe('the public API stays English (spec R7)', () => {
  beforeEach(() => headers().clear());

  it('a Polish browser and a Polish page language do not change the recommendations API', async () => {
    headers().set('x-wine-lang', 'pl');
    const m = (await (await menuGet(req('http://localhost:3000/x'), { params: Promise.resolve({ slug: 'halka' }) })).json()) as { categories: { dishes: { id: string; name: string }[] }[] };
    const ribeye = m.categories.flatMap((c) => c.dishes).find((d) => d.name.startsWith('Dry-aged ribeye'))!;
    const url = `http://localhost:3000/x?restaurant=halka&serving=glass&maxPrice=45&limit=6`;
    const plRes = await recGet(req(url, { 'accept-language': 'pl-PL,pl;q=0.9' }), { params: Promise.resolve({ dishId: ribeye.id }) });
    const enRes = await recGet(req(url), { params: Promise.resolve({ dishId: ribeye.id }) });
    const a = (await plRes.json()) as { notice: string | null; items: { why: string }[] };
    const b = (await enRes.json()) as { notice: string | null; items: { why: string }[] };
    expect(a).toEqual(b);
    expect(a.notice).toContain('Nothing matches under 45 zł');
    for (const i of a.items) expect(i.why).toMatch(/^[A-Z][a-zA-Z ,’'.-]+/);
  });
});
