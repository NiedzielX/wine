import { NextRequest } from 'next/server';
import { buildRows, linesToRows, mapTable, type ImportIssue } from '@wine-match/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatDateTime, vintageLabel, zl } from '@/app/(admin)/admin/_components/format';
import { errorText, issueText, noteText, savedText } from '@/app/(admin)/admin/_components/messages';
import { setLanguage } from '@/app/(admin)/admin/language-actions';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import { proxy, requestLocale } from '@/proxy';
import { SESSION_COOKIE, languageBack } from '@/server/auth';
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, langCookieOptions } from '@/server/lang-cookie';

/** The dashboard in Polish and English (spec 2026-10-15-polish-language, phase 2: R4, R9, R13). */

const state = () => (globalThis as unknown as { __wmNext: { cookies: Map<string, string>; RedirectSignal: new (u: string) => Error & { url: string } } }).__wmNext;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof state().RedirectSignal) return e.url;
    throw e;
  }
  throw new Error('expected a redirect');
}

describe('the language switch (setLanguage)', () => {
  beforeEach(() => state().cookies.clear());

  it('stores pl or en in wm_lang and goes back to the same dashboard page', async () => {
    expect(await redirectOf(() => setLanguage(form({ lang: 'pl', back: '/admin/halka/menu?q=duck' })))).toBe('/admin/halka/menu?q=duck');
    expect(state().cookies.get(LANG_COOKIE)).toBe('pl');
    expect(await redirectOf(() => setLanguage(form({ lang: 'en', back: '/admin/halka' })))).toBe('/admin/halka');
    expect(state().cookies.get(LANG_COOKIE)).toBe('en');
  });

  it('ignores any other value, and never touches the session', async () => {
    state().cookies.set(SESSION_COOKIE, 'token');
    expect(await redirectOf(() => setLanguage(form({ lang: 'de', back: '/admin/halka' })))).toBe('/admin/halka');
    expect(state().cookies.has(LANG_COOKIE)).toBe(false);
    await redirectOf(() => setLanguage(form({ lang: 'pl', back: '/admin/halka' })));
    expect(state().cookies.get(SESSION_COOKIE)).toBe('token');
  });

  it('works on the sign-in page (no session needed) and keeps its validated next', async () => {
    expect(await redirectOf(() => setLanguage(form({ lang: 'pl', back: `/admin/login?next=${encodeURIComponent('/admin/halka/review')}` })))).toBe('/admin/login?next=%2Fadmin%2Fhalka%2Freview');
    expect(state().cookies.get(LANG_COOKIE)).toBe('pl');
  });

  it('never redirects outside the dashboard', () => {
    expect(languageBack('https://evil.example/phish')).toBe('/admin');
    expect(languageBack('//evil.example')).toBe('/admin');
    expect(languageBack('/r/halka')).toBe('/admin');
    expect(languageBack('')).toBe('/admin');
    expect(languageBack(null)).toBe('/admin');
    expect(languageBack('/admin/login')).toBe('/admin/login');
    expect(languageBack('/admin/login?next=https://evil.example')).toBe('/admin/login');
    expect(languageBack('/admin/login?error=invalid_credentials')).toBe('/admin/login');
    expect(languageBack('/admin/halka/pairings/abc?saved=approved')).toBe('/admin/halka/pairings/abc?saved=approved');
  });

  it('the cookie is SameSite=Lax, a year long, scoped to /admin and Secure like the session cookie', () => {
    expect(langCookieOptions(true)).toEqual({ httpOnly: true, sameSite: 'lax', secure: true, path: '/admin', maxAge: 31_536_000 });
    expect(langCookieOptions(false).secure).toBe(false);
    expect(LANG_COOKIE_MAX_AGE).toBe(365 * 24 * 60 * 60);
  });
});

describe('dashboard language from the request (proxy)', () => {
  const at = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers });

  it('the cookie wins over the browser on the dashboard and the sign-in page, never on guest pages', () => {
    expect(requestLocale(at('http://x/admin/login', { cookie: 'wm_lang=pl', 'accept-language': 'en-GB' }))).toBe('pl');
    expect(requestLocale(at('http://x/admin/login', { 'accept-language': 'pl-PL' }))).toBe('pl');
    expect(requestLocale(at('http://x/admin/login'))).toBe('en');
    expect(requestLocale(at('http://x/r/halka', { cookie: 'wm_lang=pl' }))).toBe('en');
    expect(proxy(at('http://x/admin/halka', { cookie: 'wm_session=t; wm_lang=pl' })).headers.get('x-middleware-request-x-wine-lang')).toBe('pl');
  });
});

describe('dates and money in the dashboard', () => {
  it('Polish uses dd.mm.yyyy and NBSP-grouped złoty; English keeps "9 Oct 2026"', () => {
    expect(formatDateTime('2026-10-09T15:40:00.000Z', 'pl')).toBe('09.10.2026, 17:40');
    expect(formatDateTime('2026-10-09T15:40:00.000Z', 'en')).toBe('9 Oct 2026, 17:40');
    expect(formatDateTime(null, 'pl')).toBe('Nigdy');
    expect(zl(1234, 'pl')).toBe('1 234 zł');
    expect(zl(1234, 'en')).toBe('1,234 zł');
    expect(vintageLabel({ vintage: 'NV' } as never, 'pl')).toBe('Bez rocznika');
  });
});

describe('messages by code', () => {
  it('flash results and errors are chosen by code; an unknown error is the generic one, an unknown result says nothing', () => {
    expect(savedText(pl.admin.flash, 'approved', undefined)).toBe('Parowanie zatwierdzone.');
    expect(savedText(pl.admin.flash, 'approved_all', '3')).toBe('Zatwierdzono 3 parowania.');
    expect(savedText(pl.admin.flash, 'approved_all', '5')).toBe('Zatwierdzono 5 parowań.');
    expect(savedText(en.admin.flash, 'imported', '2-1-6')).toBe('Imported: 2 new, 1 updated. 6 engine suggestions are ready for review.');
    expect(savedText(pl.admin.flash, 'published', '7')).toContain('wersję 7');
    expect(savedText(en.admin.flash, 'zzz', undefined)).toBeUndefined();
    expect(errorText(pl.admin.flash, 'version_conflict')).toContain('Ktoś przed chwilą zmienił');
    expect(errorText(en.admin.flash, 'constructor')).toBe(en.admin.flash.errors.unexpected);
    expect(errorText(pl.admin.flash, 'no_such_code')).toBe(pl.admin.flash.errors.unexpected);
  });

  it('import issues are translated by code, quote their values, and keep the English text without a code', () => {
    const [row] = buildRows('wines', [{ producer: 'P', name: 'W', vintage: '2022', region: '', country: '', grape: '', style: 'Fizzy', glassPrice: '', bottlePrice: 'abc' }], { dishes: [], wines: [] });
    const style = row.issues.find((i) => i.code === 'style_unknown')!;
    expect(issueText(style, 'wines', pl, 'pl')).toMatch(/^Nieznany styl „Fizzy”: przyjęto [a-ząęłńóśźż]+\.$/);
    expect(issueText(style, 'wines', en, 'en')).toBe(style.message);
    const price = row.issues.find((i) => i.code === 'bottle_price_invalid')!;
    expect(issueText(price, 'wines', pl, 'pl')).toBe('„abc” nie jest ceną.');
    const exists: ImportIssue = { level: 'warning', field: '', code: 'exists', message: 'x' };
    expect(issueText(exists, 'menu', pl, 'pl')).toContain('Już jest w menu');
    expect(issueText(exists, 'wines', pl, 'pl')).toContain('Już jest w karcie win');
    expect(issueText({ level: 'error', field: 'name', message: 'Old message.' }, 'menu', pl, 'pl')).toBe('Old message.');
  });

  it('every English issue text matches the message core writes, so EN pages read as before', () => {
    const rows = buildRows('menu', [{ category: 'Snacks', name: '', description: '', price: 'x' }, { category: '', name: 'A', description: '', price: '0' }], { dishes: [], wines: [] });
    for (const i of rows.flatMap((r) => r.issues)) expect(issueText(i, 'menu', en, 'en')).toBe(i.message);
  });

  it('the notes core writes about how a file was read are all translated', () => {
    const notes = [
      ...mapTable('menu', [['name', 'price', 'colour'], ['Tart', '36', 'red']]).notes,
      ...mapTable('menu', [['Tart', '36']]).notes,
      ...linesToRows('menu', ['Tart 36']).notes
    ];
    expect(notes).toHaveLength(4);
    for (const n of notes) expect(noteText(n, pl)).not.toBe(n);
    // English stays as core wrote it, except that the header-less column order names the columns as the table does
    expect(notes.map((n) => noteText(n, en))).toEqual(notes.map((n) => n.replace('order: name, price.', 'order: Name, Price (zł).')));
    expect(noteText(en.admin.import.notes.pdf, pl)).toBe(pl.admin.import.notes.pdf);
    expect(noteText('Columns not used: Colour, Notes.', pl)).toBe('Nieużyte kolumny: Colour, Notes.');
    expect(noteText('No header row was found, so the columns were read in this order: name, price.', pl)).toBe('Nie znaleziono wiersza nagłówka, więc kolumny odczytano w tej kolejności: Nazwa, Cena (zł).');
    expect(noteText('Something new.', pl)).toBe('Something new.');
  });
});
