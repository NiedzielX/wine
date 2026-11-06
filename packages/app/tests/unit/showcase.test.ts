import { ROI_DEFAULTS, ROI_FIELDS, ROI_KEYS, computeRoi, parseRoiInputs } from '@wine-match/core';
import { NextRequest } from 'next/server';
import { createElement, type FunctionComponent } from 'react';
import { prerender } from 'react-dom/static';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoiPage from '@/app/(showcase)/demo/roi/page';
import RoiSummaryPage from '@/app/(showcase)/demo/roi/summary/page';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { proxy } from '@/proxy';
import { visibleText } from '../../../../scripts/lib/visible-text.mjs';
import { logger } from '@/server/logger';
import { explicitLang, formatters, roiFieldViews, roiQuery, roiSteps } from '@/server/showcase-roi';

/**
 * Spec 2026-11-04-sales-demo-and-roi-calculator, phase F1: the gate (R1, AC2 for the pages that exist), the calculator page
 * DM2 and the printable summary DM3 rendered to HTML the way the server sends them (AC6, AC7 without a browser, AC8 markup),
 * the visit counter (AC16), the dictionaries (AC17) and the view model behind the pages.
 */

const mode = vi.hoisted(() => ({ value: 'calculator' as 'off' | 'calculator' }));
vi.mock('@/server/env', () => ({ env: () => ({ showcaseMode: mode.value, logLevel: 'error' }) }));

const headers = () => (globalThis as unknown as { __wmNext: { headers: Map<string, string> } }).__wmNext.headers;
type Page = FunctionComponent<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

async function render(page: unknown, search: Record<string, string | string[] | undefined> = {}, lang: 'en' | 'pl' = 'en'): Promise<string> {
  headers().clear();
  headers().set('x-wine-lang', lang);
  const { prelude } = await prerender(createElement(page as Page, { searchParams: Promise.resolve(search) }));
  return (await new Response(prelude).text()).replace(/<!-- -->/g, '');
}
/** The text a person reads: markup out, non-breaking spaces as spaces. */
const textOf = visibleText;
const main = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'));

beforeEach(() => {
  mode.value = 'calculator';
});

describe('the gate (R1, AC2: the pages of this phase)', () => {
  it('off: both pages are a 404, and they render nothing of the calculator', async () => {
    mode.value = 'off';
    await expect(render(RoiPage)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(RoiSummaryPage)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('calculator: both pages render', async () => {
    expect(await render(RoiPage)).toContain('<h1');
    expect(await render(RoiSummaryPage)).toContain('<h1');
  });

  it('the proxy covers /demo, so the page gets its language', () => {
    const res = proxy(new NextRequest('http://x/demo/roi', { headers: { 'accept-language': 'pl-PL' } }));
    expect(res.headers.get('x-middleware-request-x-wine-lang')).toBe('pl');
    expect(res.headers.get('x-middleware-request-x-pathname')).toBeNull();
  });
});

describe('DM2 /demo/roi (AC6, AC7, R3, R4)', () => {
  it('shows each of the seven inputs with where it comes from, in both languages', async () => {
    for (const [lang, t] of [['en', en], ['pl', pl]] as const) {
      const html = await render(RoiPage, {}, lang);
      for (const f of ROI_FIELDS) {
        const block = new RegExp(`<div data-field="${f.key}" data-origin="${f.origin}"[^]*?</p></div>`).exec(html);
        expect(block, `${lang} ${f.key}`).not.toBeNull();
        expect(textOf(block![0]), `${lang} ${f.key}`).toContain(t.showcase.roi.origin[f.origin]);
      }
      expect((html.match(/data-field="/g) ?? []).length).toBe(7);
    }
  });

  it('a value typed by the person is marked as their assumption, with the default kept visible', async () => {
    const html = await render(RoiPage, { customers: '2000' }, 'pl');
    const block = /<div data-field="customers"[^]*?<\/p><\/div>/.exec(html)![0];
    expect(block).toContain('data-origin="own"');
    expect(textOf(block)).toContain('założenie: Twoja wartość (domyślnie 1 500 gości)');
    expect(block).toContain('value="2000"');
  });

  it('has one h1, the "what this is" block, the formula with the substituted numbers and the result', async () => {
    const html = await render(RoiPage, {}, 'en');
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    const text = textOf(main(html));
    expect(text).toContain('What this is');
    expect(text).toContain('These are the Wine Match team’s own assumptions');
    expect(text).toContain('We assume the whole change comes from Wine Match; we do not account for seasonality, a ramp-up period or costs on the restaurant’s side.');
    expect(text).toContain('We calculate Wine Attach Rate in the product per bill; here we approximate it with the share of guests.');
    expect(text).toContain('Extra margin after the plan fee (assumption)');
    expect(text).toContain('9,110 zł');
    expect(text).toContain('1,500 × (35% − 30%) × 150 zł');
    expect(text).toContain('1,500 × 35% × (160 zł − 150 zł)');
    expect(text).toContain('11,250 zł + 5,250 zł');
    expect(text).toContain('9,900 zł − 790 zł');
    expect(text).toContain('790 zł ÷ (60% × 150 zł)');
    expect(text).toContain('8.8 guests more per month');
  });

  it('Polish: the formula and the headline in the leading language', async () => {
    const text = textOf(main(await render(RoiPage, {}, 'pl')));
    expect(text).toContain('Dodatkowa marża po opłacie za plan (założenie)');
    expect(text).toContain('9 110 zł');
    expect(text).toContain('1 500 × (35% − 30%) × 150 zł');
    expect(text).toContain('8,8 gościa więcej miesięcznie');
    expect(text).toContain('Wine Attach Rate w produkcie liczymy per rachunek; tu przybliżamy go odsetkiem gości.');
  });

  it('never says measured, guaranteed, pilot result, profit, AI (both languages)', async () => {
    for (const lang of ['en', 'pl'] as const) {
      for (const search of [{}, { attachChange: '-5', spendChange: '0' }, { margin: '0' }]) {
        for (const page of [RoiPage, RoiSummaryPage]) {
          const text = textOf(await render(page, search, lang));
          expect(text).not.toMatch(/zmierzon|gwarantowan|wynik pilota|measured|guaranteed|pilot result|\bAI\b|sztuczn|\bprofit\b|\bzysk/i);
        }
      }
    }
  });

  it('a link with numbers reproduces them: the same query gives the same page, and the form is a GET with a label on every field', async () => {
    const q = { customers: '2400', attachRate: '41,5', wineSpend: '210', margin: '55', attachChange: '-3', spendChange: '4', planPrice: '390' };
    const a = await render(RoiPage, q);
    const b = await render(RoiPage, q);
    expect(a).toBe(b);
    const inputs = parseRoiInputs(Object.entries(q)).inputs;
    expect(textOf(main(a))).toContain(formatters('en', en.showcase).money(computeRoi(inputs).netAfterFee));
    const form = /<form[^>]*>/.exec(a)![0];
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/demo/roi#result"');
    for (const key of ROI_KEYS) {
      expect(a, key).toContain(`<label data-slot="label"`);
      expect(a, key).toMatch(new RegExp(`for="f-${key}"`));
      expect(a, key).toMatch(new RegExp(`<input[^>]*id="f-${key}"[^>]*name="${key}"|<input[^>]*name="${key}"[^>]*id="f-${key}"`));
    }
    // the typed numbers are in the inputs; "41,5" is read as 41.5 and written back with the decimal point in English
    expect(a).toContain('value="41.5"');
    expect(a).toContain('value="-3"');
  });

  it('wrong values are replaced by the defaults and named, and the page never shows NaN, Infinity or undefined', async () => {
    const hostile = Object.fromEntries([['__proto__', 'x'], ['constructor', '1'], ['customers', '1e9'], ['margin', '-4'], ['attachRate', 'abc'], ['wineSpend', ['1', '2']], ['planPrice', ''], ['attachChange', '1,,5']]) as Record<string, string | string[]>;
    const html = await render(RoiPage, hostile);
    const text = textOf(html);
    expect(text).toContain('We used the default instead of these values');
    for (const key of ['customers', 'margin', 'attachRate', 'wineSpend', 'planPrice', 'attachChange'] as const) expect(text).toContain(en.showcase.roi.fields[key].label);
    expect(text).toContain('9,110 zł');
    expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it('the extremes of the form render finite numbers: every field at its minimum and at its maximum', async () => {
    for (const edge of ['min', 'max'] as const) {
      const q = Object.fromEntries(ROI_FIELDS.map((f) => [f.key, String(f[edge])]));
      const text = textOf(await render(RoiPage, q));
      expect(text).not.toMatch(/NaN|Infinity|undefined|\[object/);
      expect(text).not.toContain('We used the default instead');
    }
  });

  it('a negative result is shown with its explanation, and a missing break-even point says why', async () => {
    const text = textOf(main(await render(RoiPage, { attachChange: '-5', spendChange: '0', margin: '0' })));
    expect(text).toContain('The value is negative');
    expect(text).toContain('-790 zł');
    expect(text).toContain('no result: the margin is 0%');
    expect(text).toContain('no result: the margin or the spend is 0');
  });

  it('keeps the explicit language in the links and the reset, and the printable link carries all numbers', async () => {
    const html = await render(RoiPage, { lang: 'pl', customers: '1000' }, 'pl');
    expect(html).toContain('<input type="hidden" name="lang" value="pl"/>');
    expect(html).toMatch(/href="\/demo\/roi\?lang=pl"/);
    expect(html).toMatch(/data-summary-link="" href="\/demo\/roi\/summary\?customers=1000&amp;attachRate=30[^"]*lang=pl"|href="\/demo\/roi\/summary\?customers=1000[^"]*lang=pl"[^>]*data-summary-link/);
    const without = await render(RoiPage, {}, 'pl');
    expect(without).not.toContain('name="lang"');
  });

  it('sets no cookie of its own and loads nothing from another host', async () => {
    const html = await render(RoiPage);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(html).not.toMatch(/document\.cookie|localStorage|sessionStorage/);
  });
});

describe('DM3 /demo/roi/summary (AC8, R5)', () => {
  it('has the title, the inputs table with origins, the formula, the "what this is" block and the note', async () => {
    const html = await render(RoiSummaryPage, {}, 'pl');
    const text = textOf(main(html));
    expect(text).toContain('Podsumowanie założeń: kalkulator zwrotu Wine Match');
    expect(html.match(/<tr data-field=/g)).toHaveLength(7);
    expect(text).toContain('założenie zespołu: wartość robocza, bez źródła');
    expect(text).toContain('1 500 × (35% − 30%) × 150 zł');
    expect(text).toContain('Czym to jest');
    expect(text).toContain('To założenia, nie pomiary');
  });

  it('shows the date from the d parameter and never the server clock; a bad date is none', async () => {
    expect(textOf(await render(RoiSummaryPage, { d: '2026-11-06' }, 'pl'))).toContain('Data: 06.11.2026');
    expect(textOf(await render(RoiSummaryPage, { d: '2026-11-06' }, 'en'))).toContain('Date: 06/11/2026');
    for (const bad of ['2026-02-30', 'today', '<b>', '']) {
      const html = await render(RoiSummaryPage, { d: bad }, 'en');
      expect(html).not.toContain('data-print-date');
      expect(textOf(html)).toContain('Date: not set');
    }
    const year = String(new Date().getFullYear());
    expect(textOf(main(await render(RoiSummaryPage, {})))).not.toContain(year);
  });

  it('hides the navigation and the controls on paper, and has no print button without a script', async () => {
    const html = await render(RoiSummaryPage);
    expect(/<header[^>]*class="[^"]*print:hidden/.test(html)).toBe(true);
    expect(/<section[^>]*data-print-controls[^>]*>/.exec(html)![0]).toContain('print:hidden');
    expect(/<section[^>]*class="[^"]*print:hidden[^"]*"[^>]*data-print-controls/.test(html) || /data-print-controls[^>]*class="[^"]*print:hidden/.test(html)).toBe(true);
    expect(html).not.toContain('data-print-button');
    expect(textOf(html)).toContain('Use Ctrl/Cmd+P to print or save as PDF.');
  });

  it('carries the numbers back to the calculator and keeps the typed date in its form', async () => {
    const html = await render(RoiSummaryPage, { customers: '900', d: '2026-11-06', lang: 'en' });
    expect(html).toMatch(/href="\/demo\/roi\?customers=900&amp;[^"]*lang=en"/);
    expect(html).toContain('name="customers" value="900"');
    expect(html).toContain('value="2026-11-06"');
  });
});

describe('the visit counter (AC16, R9, Q9)', () => {
  it('writes exactly one showcase_view line per visit with the page name and no other field', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      await render(RoiPage, { customers: '777', lang: 'pl' });
      expect(info.mock.calls).toEqual([['showcase_view', { page: 'roi' }]]);
      info.mockClear();
      await render(RoiSummaryPage, { customers: '777', d: '2026-11-06' });
      expect(info.mock.calls).toEqual([['showcase_view', { page: 'roi_summary' }]]);
    } finally {
      info.mockRestore();
    }
  });

  it('counts nothing when the page is a 404', async () => {
    mode.value = 'off';
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    try {
      await expect(render(RoiPage)).rejects.toThrow();
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});

describe('dictionaries (AC17, R3, R13)', () => {
  const leaves = (o: unknown, path = ''): Array<[string, unknown]> =>
    o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => leaves(v, `${path}${path ? '.' : ''}${k}`)) : [[path, o]];

  it('Polish and English have the same showcase keys', () => {
    expect(leaves(pl.showcase).map(([k]) => k).sort()).toEqual(leaves(en.showcase).map(([k]) => k).sort());
  });

  it('Polish declines "gość" for 1, 2, 5, 22 and 12, and a fraction takes the genitive singular', () => {
    const g = (n: number) => pl.showcase.roi.guests(n, String(n));
    expect([g(1), g(2), g(5), g(22), g(12), g(14), g(24), g(100), g(0)]).toEqual(['1 gość', '2 goście', '5 gości', '22 goście', '12 gości', '14 gości', '24 goście', '100 gości', '0 gości']);
    expect(pl.showcase.roi.guests(8.8, '8,8')).toBe('8,8 gościa');
    expect([1, 2, 5].map((n) => en.showcase.roi.guests(n, String(n)))).toEqual(['1 guest', '2 guests', '5 guests']);
  });

  it('no text of the showcase says AI, measured, guaranteed or profit (N02, R3); functions are called with sample values', () => {
    const strings = (dict: typeof en.showcase): string[] => {
      const out: string[] = [];
      const walk = (v: unknown) => {
        if (typeof v === 'string') out.push(v);
        else if (typeof v === 'function') {
          // the functions take a list of names, or a number and its text, or two texts
          for (const args of [[['a', 'b']], [3, '3'], ['5 pp', '2 pp'], ['150 zł']] as unknown[][]) {
            try { out.push(String((v as (...a: unknown[]) => unknown)(...args))); } catch { /* wrong kind of arguments for this function */ }
          }
        }
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      };
      walk(dict);
      return out;
    };
    for (const dict of [en.showcase, pl.showcase]) {
      for (const s of strings(dict)) expect(s).not.toMatch(/\bAI\b|sztuczn|zmierzon|gwarantowan|wynik pilota|measured|guaranteed|pilot result|\bprofit\b|\bzysk/i);
    }
  });
});

describe('the view model of the pages', () => {
  const view = (search: Record<string, unknown>, locale: 'en' | 'pl' = 'en') => {
    const parsed = parseRoiInputs(Object.entries(search));
    const t = locale === 'en' ? en : pl;
    return { parsed, steps: roiSteps(computeRoi(parsed.inputs), locale, t.showcase), fields: roiFieldViews(parsed, locale, t.showcase) };
  };

  it('the steps of the defaults end in the numbers of AC3, in whole złoty', () => {
    const steps = Object.fromEntries(view({}).steps.map((s) => [s.id, s.value]));
    expect(steps).toMatchObject({ attachAfter: '35%', spendAfter: '160 zł', attachEffect: '11,250 zł', spendEffect: '5,250 zł', revenue: '16,500 zł', margin: '9,900 zł', net: '9,110 zł', breakEvenRevenue: '1,317 zł per month' });
    expect(steps.breakEvenGuests).toBe('8.8 guests more per month');
  });

  it('notes a change that was cut at the edge of its range', () => {
    const steps = view({ attachRate: '98', attachChange: '5', wineSpend: '10', spendChange: '-50' }).steps;
    expect(steps[0].note).toBe('The change in the share is limited to the range 0–100%: we apply 2 pp instead of 5 pp.');
    expect(steps[1].note).toBe('Spend cannot go below 0: we apply -10 zł instead of -50 zł.');
    expect(view({}).steps.every((s) => s.note === undefined)).toBe(true);
  });

  it('a negative number reads as a subtraction in the substituted formula', () => {
    expect(view({ attachChange: '-50' }).steps[0].filled).toBe('min(100%, max(0%, 30% − 50 pp))');
    expect(view({ spendChange: '-20' }).steps[1].filled).toBe('max(0, 150 zł − 20 zł)');
  });

  it('no figure prints as "-0" and rounding is for display only', () => {
    const steps = view({ customers: '1', attachChange: '0', spendChange: '0', wineSpend: '0.4' }).steps;
    for (const s of steps) expect(s.value).not.toMatch(/-0(?!\.\d)\b(?! zł per)|^-0 /);
    expect(steps.find((s) => s.id === 'attachEffect')!.value).toBe('0 zł');
  });

  it('the fields say whether a value is the default or the person’s own', () => {
    const fields = view({ customers: '2000', margin: 'x' }, 'pl').fields.map((f) => ({ ...f, valueText: f.valueText.replace(/\u00a0/g, ' '), defaultText: f.defaultText.replace(/\u00a0/g, ' ') }));
    expect(fields.find((f) => f.key === 'customers')).toMatchObject({ origin: 'own', inputValue: '2000', valueText: '2 000 gości', defaultText: '1 500 gości' });
    expect(fields.find((f) => f.key === 'margin')).toMatchObject({ origin: 'working', inputValue: '60', valueText: '60%' });
    expect(fields.find((f) => f.key === 'planPrice')).toMatchObject({ origin: 'concept', valueText: '790 zł' });
    expect(view({ attachRate: '12.5' }, 'pl').fields.find((f) => f.key === 'attachRate')!.inputValue).toBe('12,5');
  });

  it('roiQuery writes all seven numbers in a form that reads back the same, and only the extras that are set', () => {
    const { inputs } = parseRoiInputs(Object.entries({ attachChange: '-0,000001', wineSpend: '99,999999', customers: '17' }));
    const q = roiQuery(inputs, { lang: 'pl', d: undefined, x: '' });
    expect([...new URLSearchParams(q).keys()]).toEqual([...ROI_KEYS, 'lang']);
    expect(parseRoiInputs(new URLSearchParams(q)).inputs).toEqual(inputs);
    expect(roiQuery(ROI_DEFAULTS)).toBe('customers=1500&attachRate=30&wineSpend=150&margin=60&attachChange=5&spendChange=10&planPrice=790');
  });

  it('only a real language is kept from the query', () => {
    expect([explicitLang('pl'), explicitLang('en'), explicitLang('de'), explicitLang(['pl']), explicitLang(undefined)]).toEqual(['pl', 'en', undefined, undefined, undefined]);
  });
});
