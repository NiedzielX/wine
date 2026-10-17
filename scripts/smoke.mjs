#!/usr/bin/env node
/**
 * Smoke test of a RUNNING app (guest pages, dashboard pages + public API): status codes and key content.
 *   npm run build && npm start        (in one terminal)
 *   npm run smoke                     (default http://localhost:3000, restaurant "halka")
 *   npm run smoke -- http://localhost:3101 halka
 * Works against both data sources; ids are discovered through the API, nothing is hard-coded.
 */
const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const slug = process.argv[3] ?? 'halka';
const EMAIL = process.env.SMOKE_EMAIL ?? 'marta@halka.pl';      // demo accounts only: see .env.example
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo-halka-2026';
let failures = 0;
let SESSION = '';   // cookie of the signed-in sommelier, used for dashboard requests

/**
 * Every request of the smoke test is our own traffic: it carries `x-wine-match-synthetic: 1`, so the guest pages render
 * as usual but record no usage events (spec 2026-10-15-guest-usage-events, Q14). Set here once, for every fetch.
 */
const SYNTHETIC = { 'x-wine-match-synthetic': '1' };
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => realFetch(url, { ...init, headers: { ...SYNTHETIC, ...(init.headers ?? {}) } });

async function check(name, path, { status = 200, has = [], hasNot = [], method = 'GET', body, redirect = 'follow', cookie, headers = {}, location } = {}) {
  const useCookie = cookie ?? (path.startsWith('/admin') ? SESSION : '');
  const res = await fetch(base + path, {
    method, redirect,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(useCookie ? { cookie: useCookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  // React separates adjacent text nodes with <!-- --> markers; strip them so assertions read naturally
  const text = (await res.text()).replace(/<!-- -->/g, '');
  const problems = [];
  if (res.status !== status) problems.push(`status ${res.status}, expected ${status}`);
  for (const s of has) if (!text.includes(s)) problems.push(`missing "${s}"`);
  for (const s of hasNot) if (text.includes(s)) problems.push(`unexpected "${s}"`);
  if (location !== undefined && !(res.headers.get('location') ?? '').includes(location)) problems.push(`Location "${res.headers.get('location')}" does not contain "${location}"`);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${String(res.status).padEnd(3)} ${name}${problems.length ? `\n       ${problems.join('; ')}` : ''}`);
  if (problems.length) failures++;
  return { res, text };
}

const json = async (path) => (await fetch(base + path)).json();

function expect(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}     ${name}${ok ? '' : `\n       ${detail}`}`);
  if (!ok) failures++;
}

async function apiLogin(email, password) {
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const text = await res.text();
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return { res, text, body: (() => { try { return JSON.parse(text); } catch { return {}; } })(), setCookie, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') };
}

// discover ids through the public API
const menu = await json(`/api/v1/public/restaurants/${slug}/menu`);
const dishes = menu.categories.flatMap((c) => c.dishes);
const dish = (name) => dishes.find((d) => d.name === name)?.id;
const duck = dish('Duck breast');
const tartare = dish('Beef tartare');
const risotto = dish('Wild mushroom risotto');
const recs = await json(`/api/v1/dishes/${duck}/recommendations?restaurant=${slug}`);
const wine = recs.items[0].wine.id;
const R = `/r/${slug}`;
// a fixed guest session: every guest link carries `sid` last (spec 2026-10-15-guest-usage-events, R3)
const SID = '5a0be7e5-0000-4000-8000-00000000c0de';
// spec 2026-10-16-how-it-works-explanations (R7, AC10): one name for the sommelier's pairings and the engine's top pick
const OLD_LABELS = ['Sommelier recommendation', 'sommelier recommendation', 'Rekomendacja sommeliera', 'Best match', 'Najlepsze dopasowanie', 'Perfect with your dish', 'Pasuje do Twojego dania', 'Para od sommeliera', 'Every recommendation follows', 'Sommelier pairing available', 'Wine Director’s first choice'];
const plain = dish('Burrata & roasted pumpkin');

await check('root redirects to the restaurant', '/', { has: ['Pick your dish'] });
await check('G0 landing with the menu', R, { has: ['Pick your dish', 'Duck breast', 'Pair a bottle for the table', 'Wine Director', `${R}/dish/${duck}/wines`] });
await check('G0 keeps preferences in dish links', `${R}?serving=glass`, { has: [`${R}/dish/${duck}/wines?serving=glass`] });
await check('G1 dish list', `${R}/menu`, { has: ['Beef tartare', 'Duck breast', 'Sommelier’s pairing', 'One dish', 'Whole table'], hasNot: OLD_LABELS });
await check('G2 redirects to the wines with the whole query', `${R}/dish/${duck}?serving=glass&sheet=filters`, { status: 308, redirect: 'manual', location: `${R}/dish/${duck}/wines?serving=glass&sheet=filters` });
await check('G3 unknown dish', `${R}/dish/00000000-0000-4000-8000-000000000000/wines`, { status: 404 });
await check('G3 recommendations', `${R}/dish/${duck}/wines`, { has: ['Sommelier’s pairing', 'Pinot and sour cherry jus', 'Also good with this dish', 'Savigny', 'Roasted duck breast', 'Quick preferences', 'aria-current="page"', '<details data-explain="wines"', 'Why these wines?', 'shown from 62%', 'Every wine comes from Halka’s list', 'aria-label="Match '], hasNot: ['AI recommendation', 'Powered by AI', ...OLD_LABELS, ' open=""'] });
await check('G3 a dish without a sommelier’s pairing: the engine’s top pick', `${R}/dish/${plain}/wines`, { has: ['Recommended for your dish', 'data-explain="wines"'], hasNot: OLD_LABELS });
await check('G3 quick chip toggles off', `${R}/dish/${duck}/wines?serving=glass&sid=${SID}`, { has: [`href="${R}/dish/${duck}/wines?sid=${SID}"`, `${R}/menu?serving=glass&amp;sid=${SID}`] });
await check('G3 filter: glass', `${R}/dish/${duck}/wines?serving=glass`, { has: ['By the glass', 'Glass 64 zł'], hasNot: ['Bottle 380 zł'] });
await check('G3 filter: budget too low', `${R}/dish/${dish('Dry-aged ribeye, 300 g')}/wines?serving=glass&maxPrice=45`, { has: ['Nothing matches under 45 zł'] });
await check('G4 filters sheet', `${R}/dish/${duck}/wines?sheet=filters`, { has: ['role="dialog"', 'Refine', 'Reset', 'Mood', 'Body', 'data-explain="wines"', 'data-explain="filters"', 'How do the filters work?'] });
await check('G7 wine details', `${R}/wine/${wine}?dish=${duck}`, { has: ['Choose this wine', 'Region', 'Marta Wierzbicka, Wine Director', 'data-explain="wine"', 'What does this score mean?', 'role="img" aria-label="Match '] });
await check('G7 from the table result: no match glass', `${R}/wine/${wine}?table=${tartare},${duck}`, { has: ['data-explain="wine"', 'There is no rating here'], hasNot: ['aria-label="Match '] });
await check('G7 unknown wine', `${R}/wine/00000000-0000-4000-8000-000000000000`, { status: 404 });
await check('G8 confirmation (glass)', `${R}/selected/${wine}?serving=glass&dish=${duck}`, { has: ['Show this to your waiter', 'List no. 112', '1 glass, 150 ml, 64 zł', 'With the duck breast'], hasNot: ['aria-label="Match '] });
await check('G8 confirmation falls back to bottle', `${R}/selected/${dishes.length && recs.items.find((i) => i.wine.glassPrice === null)?.wine.id}?serving=glass`, { has: ['1 bottle, 750 ml'] });
await check('G5 table selection', `${R}/table`, { has: ['Tick everything your table is ordering', 'Find a bottle for the table', 'Colour and budget'] });
await check('G6 table result', `${R}/table/result?dish=${tartare}&dish=${risotto}&dish=${duck}`, { has: ['Recommended for your table', 'Overall match', 'Savigny', '85%'] });
await check('G6 table with one dish', `${R}/table/result?dish=${duck}`, { has: ['Add at least two dishes'] });
await check('G9 staff lookup', `${R}/staff?dish=${duck}`, { has: ['Say:', 'Sommelier’s pairing · first choice', 'no. 112'], hasNot: OLD_LABELS });
// --- Polish interface (spec 2026-10-15-polish-language): language from the browser, `?lang` wins, the API stays English
const PL = { 'accept-language': 'pl-PL,pl;q=0.9' };
await check('G0 in Polish from Accept-Language', R, { headers: PL, has: ['<html lang="pl"', 'Wybierz danie', 'Pokażemy wina z naszej karty, które do niego pasują.', 'Dobierz butelkę do stolika', `${R}?lang=en`], hasNot: ['Pick your dish'] });
await check('G0 in English without Accept-Language', R, { has: ['<html lang="en"', 'Pick your dish'], hasNot: ['Wybierz danie'] });
await check('G0 in English for an English browser', R, { headers: { 'accept-language': 'en-GB' }, has: ['Pick your dish'] });
await check('G0 links do not carry a language from the browser', `${R}?sid=${SID}`, { headers: PL, has: [`href="${R}/dish/${duck}/wines?sid=${SID}"`], hasNot: [`${R}/dish/${duck}/wines?lang=`] });
// E02 phase 1: the anonymous session travels in every guest link and form, never in a cookie
const g0 = await check('G0 without sid starts a session: its links carry a new sid, "For staff" none', R, { has: ['sid='], hasNot: [`${R}/staff?sid=`] });
expect('G0 sets no cookie', !g0.res.headers.get('set-cookie'));
await check('G0 with a session keeps it in the language switch', `${R}?sid=${SID}`, { has: [`?lang=pl&amp;sid=${SID}`, `${R}/table?sid=${SID}`] });
await check('G7 with sid: 200, the form carries the session', `${R}/wine/${wine}?dish=${duck}&sid=${SID}`, { has: [`name="sid" value="${SID}"`] });
await check('G5 form carries the session', `${R}/table?sid=${SID}`, { has: [`name="sid" value="${SID}"`] });
await check('G9 links and form carry the staff session', `${R}/staff?sid=${SID}`, { has: [`name="sid" value="${SID}"`, `sid=${SID}`] });
// (the router payload repeats the requested URL, so only the links are checked)
await check('a malformed sid is replaced, not an error', `${R}/menu?sid=NOT-A-UUID`, { has: ['sid='], hasNot: ['href="/r/halka/menu?sid=NOT-A-UUID', 'sid=NOT-A-UUID" ', '&amp;sid=NOT-A-UUID'] });
await check('G0 ?lang=en wins over a Polish browser and travels in the links', `${R}?lang=en`, { headers: PL, has: ['<html lang="en"', 'Pick your dish', `${R}/dish/${duck}/wines?lang=en`, `${R}/table?lang=en`, `${R}/staff?lang=en`, 'aria-current="true"'], hasNot: ['Wybierz danie'] });
await check('G3 in Polish: engine reason translated, sommelier note in Polish', `${R}/dish/${duck}/wines`, { headers: PL, has: ['<html lang="pl"', 'Para sommeliera', 'Skąd te wina?', 'pokazujemy je od 62%', 'aria-label="Dopasowanie ', 'Pinot noir i sos wiśniowy', 'Też pasuje do tego dania', 'Świeża kwasowość równoważy bogactwo potrawy', 'Na kieliszki', 'Więcej…', 'Czerwone', 'Kieliszek 64\u00a0zł', 'dopasowanie'], hasNot: ['Also good with this dish', 'AI', ...OLD_LABELS] });
await check('G3 ?lang=pl without a header', `${R}/dish/${duck}/wines?lang=pl&serving=glass`, { has: ['Para sommeliera', `${R}/menu?serving=glass&amp;lang=pl`] });
await check('G3 in Polish, a dish without a sommelier’s pairing', `${R}/dish/${plain}/wines?lang=pl`, { has: ['Polecane do Twojego dania', 'data-explain="wines"'], hasNot: OLD_LABELS });
await check('G3 budget notice in Polish', `${R}/dish/${dish('Dry-aged ribeye, 300 g')}/wines?serving=glass&maxPrice=45`, { headers: PL, has: ['Nic nie mieści się w budżecie do 45\u00a0zł'] });
await check('G5 in Polish keeps an explicit language in the form', `${R}/table?lang=pl`, { has: ['Dania główne', 'Znajdź butelkę dla stolika', 'name="lang" value="pl"'] });
await check('G7 in Polish keeps an explicit language in the form', `${R}/wine/${wine}?dish=${duck}&lang=pl`, { has: ['Wybierz to wino', 'name="lang" value="pl"', 'Marta Wierzbicka, Wine Director'] });
await check('G8 in Polish', `${R}/selected/${wine}?serving=glass&dish=${duck}`, { headers: PL, has: ['Pokaż to kelnerowi.', '1 kieliszek, 150 ml, 64\u00a0zł'] });
await check('unknown restaurant in Polish', '/r/nope', { status: 404, headers: PL, has: ['To menu jest niedostępne'] });
// --- bilingual content (spec 2026-10-15-bilingual-content): Polish content, English with ?lang=en, the API keeps the base
await check('AC1 G0 in Polish: Polish dish names and descriptions, Warszawa', `${R}?lang=pl`, { has: ['Pierś z kaczki', 'Tatar wołowy', 'Śledź bałtycki', 'Sernik pieczony', 'Siekana ręcznie polędwica', 'Warszawa'], hasNot: ['Duck breast', 'Baltic herring', 'Warsaw<'] });
await check('AC1 G1 menu in Polish', `${R}/menu`, { headers: PL, has: ['Pierś z kaczki', 'Comber z jelenia'], hasNot: ['Duck breast'] });
await check('AC1 G3 duck in Polish: Polish note and wine region', `${R}/dish/${duck}/wines?lang=pl`, { has: ['Pierś z kaczki', 'Pinot noir i sos wiśniowy — nasze firmowe połączenie.', 'Burgundia'], hasNot: ['Pinot and sour cherry jus', 'Burgundy'] });
await check('AC1 G7 wine in Polish: tasting note, region and country', `${R}/wine/${wine}?dish=${duck}&lang=pl`, { has: ['Czerwone owoce, runo leśne', 'Francja'], hasNot: ['forest floor'] });
await check('AC1 G6 table in Polish', `${R}/table/result?dish=${tartare}&dish=${risotto}&dish=${duck}&lang=pl`, { has: ['Pierś z kaczki', 'Tatar wołowy'] });
await check('AC1 G9 staff in Polish', `${R}/staff?dish=${duck}&lang=pl`, { has: ['Pierś z kaczki'] });
await check('AC1 ?lang=en: English content even for a Polish browser', `${R}/dish/${duck}/wines?lang=en`, { headers: PL, has: ['Duck breast', 'Pinot and sour cherry jus', 'Burgundy'], hasNot: ['Pierś z kaczki'] });
await check('AC1 G0 ?lang=en: Warsaw', `${R}?lang=en`, { headers: PL, has: ['Warsaw', 'Duck breast'], hasNot: ['Warszawa', 'Pierś z kaczki'] });
for (const [name, path] of [['G0', R], ['G3', `${R}/dish/${duck}/wines`], ['G5', `${R}/table`], ['G7', `${R}/wine/${wine}?dish=${duck}`]]) {
  await check(`AC2 ${name} has the "Polski / English" switch at the top`, path, { has: ['aria-label="Polski"', 'aria-label="English"', '>Polski<', '>English<', '>PL<', '>EN<'] });
}
await check('AC2 A0 sign-in has the "Polski / English" switch', '/admin/login', { cookie: '', has: ['aria-label="Polski"', 'aria-label="English"', '>Polski<', '>English<'] });
const apiMenuPl = await (await fetch(`${base}/api/v1/public/restaurants/${slug}/menu?lang=pl`, { headers: PL })).text();
expect('AC6 API menu keeps the base (English) names with a Polish browser and ?lang=pl', apiMenuPl.includes('Duck breast') && apiMenuPl.includes('Beef tartare') && !apiMenuPl.includes('Pierś z kaczki') && !apiMenuPl.includes('Warszawa'), apiMenuPl.slice(0, 200));

const apiPl = await (await fetch(`${base}/api/v1/dishes/${duck}/recommendations?restaurant=${slug}`, { headers: PL })).json();
expect('API recommendations stay English with a Polish browser', JSON.stringify(apiPl.items.map((i) => i.why)) === JSON.stringify(recs.items.map((i) => i.why)) && apiPl.items.some((i) => /^[A-Z][a-z]/.test(i.why) && !/[ąęłśżź]/.test(i.why)), JSON.stringify(apiPl.items.map((i) => i.why)));

await check('unknown restaurant', '/r/nope', { status: 404 });
await check('unknown restaurant (menu)', '/r/nope/menu', { status: 404 });

await check('API recommendations', `/api/v1/dishes/${duck}/recommendations?restaurant=${slug}&serving=glass`, { has: ['sommelier_primary', 'engineVersion'] });
await check('API recommendations without restaurant', `/api/v1/dishes/${duck}/recommendations`, { status: 422, has: ['validation_failed'] });
await check('API recommendations unknown restaurant', `/api/v1/dishes/${duck}/recommendations?restaurant=nope`, { status: 404 });
await check('API menu', `/api/v1/public/restaurants/${slug}/menu`, { has: ['Starters', 'hasSommelierPairing'] });
await check('API menu unknown restaurant', '/api/v1/public/restaurants/nope/menu', { status: 404 });
const t = await check('API table', '/api/v1/recommendations/table', { method: 'POST', body: { restaurantSlug: slug, dishIds: [tartare, risotto, duck] }, has: ['"overall":85', 'perDish'] });
await check('API table with one dish', '/api/v1/recommendations/table', { method: 'POST', body: { restaurantSlug: slug, dishIds: [duck] }, status: 422, has: ['validation_failed'] });
await check('API table with bad body', '/api/v1/recommendations/table', { method: 'POST', body: { dishIds: 'x' }, status: 422 });
await check('API table unknown restaurant', '/api/v1/recommendations/table', { method: 'POST', body: { restaurantSlug: 'nope', dishIds: [tartare, duck] }, status: 404 });
void t;

const A = `/admin/${slug}`;

// --- authentication (Phase 4)
const bad = await apiLogin(EMAIL, 'definitely-wrong-password');
const unknown = await apiLogin('nobody@example.com', 'definitely-wrong-password');
expect('login with a wrong password: 401 and a generic message', bad.res.status === 401 && bad.body.error?.code === 'invalid_credentials', `status ${bad.res.status} ${bad.text}`);
expect('login with an unknown e-mail gives the identical answer (no account enumeration)', unknown.res.status === 401 && unknown.text === bad.text, `${unknown.text} vs ${bad.text}`);
const login = await apiLogin(EMAIL, PASSWORD);
expect('login: 200 with the user, restaurants and a CSRF token', login.res.status === 200 && login.body.user?.email === EMAIL && login.body.memberships?.[0]?.restaurantSlug === slug && login.body.csrfToken?.length >= 40, `status ${login.res.status} ${login.text.slice(0, 160)}`);
const sc = login.setCookie.join(' | ');
expect('session cookie is httpOnly and SameSite=Lax, and does not contain the CSRF token', /wm_session=/.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc) && !sc.includes(login.body.csrfToken), sc);
SESSION = login.cookie;
const CSRF = login.body.csrfToken;
const write = (extra = {}) => ({ 'x-csrf-token': CSRF, cookie: SESSION, ...extra });

await check('no session: /admin goes to the sign-in page', '/admin', { cookie: '', redirect: 'manual', status: 307, location: '/admin/login' });
await check('no session: the dashboard goes to sign-in and remembers where you were', `/admin/${slug}`, { cookie: '', redirect: 'manual', status: 307, location: `/admin/login?next=${encodeURIComponent(`/admin/${slug}`)}` });
for (const path of [`/menu`, `/wines`, `/review`, `/publish`, `/pairings/${duck}`, `/menu/${duck}`]) {
  await check(`no session: ${path} is not reachable and sign-in remembers it`, `/admin/${slug}${path}`, { cookie: '', redirect: 'manual', status: 307, location: `/admin/login?next=${encodeURIComponent(`/admin/${slug}${path}`)}` });
}
await check('sign-in page', '/admin/login', { cookie: '', has: ['Sign in', 'Work e-mail', 'Password'] });
await check('sign-in page ignores a foreign "next" address (no hidden field)', '/admin/login?next=https://evil.example/phish', { cookie: '', has: ['Sign in'], hasNot: ['name="next"'] });
await check('sign-in page keeps a dashboard "next" address', `/admin/login?next=${encodeURIComponent(`/admin/${slug}/review`)}`, { cookie: '', has: ['name="next"'] });
await check('sign-in page shows one generic message', '/admin/login?error=invalid_credentials', { cookie: '', has: ['incorrect, or the account is temporarily locked'] });
await check('no session: API me', '/api/v1/auth/me', { status: 401, has: ['unauthenticated'] });
await check('no session: API list pairings', `/api/v1/restaurants/${slug}/pairings`, { status: 401 });
await check('no session: API change a wine', `/api/v1/wines/${wine}?restaurant=${slug}`, { method: 'PATCH', body: { active: false }, status: 401 });
await check('API me with a session', '/api/v1/auth/me', { cookie: SESSION, has: ['csrfToken', slug] });

const hdr = (await fetch(`${base}/admin/login`)).headers;
expect('dashboard responses are never cached or framed', /no-store/.test(hdr.get('cache-control') ?? '') && hdr.get('x-frame-options') === 'DENY', `${hdr.get('cache-control')} / ${hdr.get('x-frame-options')}`);
expect('every response has nosniff', (await fetch(`${base}/r/${slug}`)).headers.get('x-content-type-options') === 'nosniff');

const wineUrl = `/api/v1/wines/${wine}?restaurant=${slug}`;
await check('write without the CSRF token is refused', wineUrl, { method: 'PATCH', body: { active: false }, cookie: SESSION, status: 403, has: ['csrf'] });
await check('write with a wrong CSRF token is refused', wineUrl, { method: 'PATCH', body: { active: false }, cookie: SESSION, headers: { 'x-csrf-token': 'x'.repeat(43) }, status: 403, has: ['csrf'] });
await check('write from another origin is refused', wineUrl, { method: 'PATCH', body: { active: false }, headers: write({ origin: 'https://evil.example' }), status: 403, has: ['csrf'] });
await check('write flagged cross-site by the browser is refused', wineUrl, { method: 'PATCH', body: { active: false }, headers: write({ 'sec-fetch-site': 'cross-site' }), status: 403 });
await check('hide a wine through the API', wineUrl, { method: 'PATCH', body: { active: false }, headers: write(), has: ['"active":false'] });
await check('show it again', wineUrl, { method: 'PATCH', body: { active: true }, headers: write(), has: ['"active":true'] });
await check('wine API validates the body', wineUrl, { method: 'PATCH', body: { active: 'yes' }, headers: write(), status: 422 });

const approved = await (await fetch(`${base}/api/v1/restaurants/${slug}/pairings?dishId=${duck}&status=approved`, { headers: { cookie: SESSION } })).json();
const target = approved.data?.[0];
expect('API lists current pairings with their versions', Array.isArray(approved.data) && approved.data.length === 2 && Number.isInteger(target?.version), JSON.stringify(approved).slice(0, 200));
const pUrl = `/api/v1/pairings/${target.id}?restaurant=${slug}`;
await check('changing a pairing requires If-Match', pUrl, { method: 'PATCH', body: { comment: 'x' }, headers: write(), status: 428 });
await check('a stale version is a conflict', pUrl, { method: 'PATCH', body: { comment: 'x' }, headers: write({ 'if-match': '"999"' }), status: 409, has: ['version_conflict'] });
await check('a malformed If-Match is refused', pUrl, { method: 'PATCH', body: { comment: 'x' }, headers: write({ 'if-match': 'banana' }), status: 400 });
await check('one change per request', pUrl, { method: 'PATCH', body: { comment: 'x', role: 'primary' }, headers: write({ 'if-match': `"${target.version}"` }), status: 422 });
await check('unknown status is refused', pUrl, { method: 'PATCH', body: { status: 'banana' }, headers: write({ 'if-match': `"${target.version}"` }), status: 422 });
await check('a note over 140 characters is refused', pUrl, { method: 'PATCH', body: { comment: 'x'.repeat(141) }, headers: write({ 'if-match': `"${target.version}"` }), status: 422, has: ['comment_too_long'] });
// an engine suggestion (not one of the sommelier's own pairings) cannot be deleted, only rejected
const engine = (await (await fetch(`${base}/api/v1/restaurants/${slug}/pairings?dishId=${duck}&status=suggested`, { headers: { cookie: SESSION } })).json()).data?.find((p) => p.source === 'engine');
await check('deleting an engine pairing is refused', `/api/v1/pairings/${engine.id}?restaurant=${slug}`, { method: 'DELETE', headers: write({ 'if-match': `"${engine.version}"` }), status: 422, has: ['only_manual_pairings_can_be_deleted'] });
await check('unknown pairing', `/api/v1/pairings/00000000-0000-4000-8000-000000000000?restaurant=${slug}`, { method: 'PATCH', body: { comment: 'x' }, headers: write({ 'if-match': '"1"' }), status: 404 });
await check('bulk decision needs a valid action', `/api/v1/restaurants/${slug}/pairings/bulk-decision`, { method: 'POST', body: { action: 'delete_everything' }, headers: write(), status: 422 });
await check('publish without changes of this kind is allowed only when something is pending', `/api/v1/restaurants/${slug}/publish`, { method: 'POST', headers: { 'x-csrf-token': 'wrong', cookie: SESSION }, status: 403 });

// the general manager: runs the business, does not decide pairings
const gm = await apiLogin('tomasz@halka.pl', PASSWORD);
const GM = gm.cookie;
expect('the general manager can sign in', gm.res.status === 200 && gm.body.memberships?.[0]?.role === 'manager', gm.text.slice(0, 120));
const gmw = { 'x-csrf-token': gm.body.csrfToken, cookie: GM };
await check('GM sees the pairing screen as view-only', `/admin/${slug}/pairings/${duck}`, { cookie: GM, has: ['View only', 'What guests see now'], hasNot: ['Set role', 'Add your own pairing', 'Approve all'] });
await check('GM sees the review queue without approve buttons', `/admin/${slug}/review`, { cookie: GM, has: ['View only'], hasNot: ['Approve all'] });
await check('GM cannot change a pairing through the API', pUrl, { method: 'PATCH', body: { comment: 'x' }, headers: { ...gmw, 'if-match': `"${target.version}"` }, status: 403, has: ['forbidden'] });
await check('GM cannot bulk-approve', `/api/v1/restaurants/${slug}/pairings/bulk-decision`, { method: 'POST', body: { action: 'approve_all' }, headers: gmw, status: 403 });
await check('GM can read pairings', `/api/v1/restaurants/${slug}/pairings`, { cookie: GM, has: ['"data"'] });
await check('GM can hide and show wines', wineUrl, { method: 'PATCH', body: { active: true }, headers: gmw, has: ['"active":true'] });
await check('GM sees the publish screen with a working button', `/admin/${slug}/publish`, { cookie: GM, has: ['Publish changes'], hasNot: ['Your role cannot publish'] });
await check('a session of one user does not open another restaurant', `/admin/nope`, { cookie: GM, status: 403 });

// --- import, QR and setup (Phase 5). Nothing here changes the catalog: every import is cancelled.
for (const path of ['/import/menu', '/import/wines', '/setup', '/qr']) {
  await check(`no session: ${path} is not reachable`, `/admin/${slug}${path}`, { cookie: '', redirect: 'manual', status: 307, location: '/admin/login' });
}
await check('no session: QR API', `/api/v1/restaurants/${slug}/qr`, { cookie: '', status: 401 });
await check('no session: import upload', `/api/v1/imports/menu?restaurant=${slug}`, { method: 'POST', cookie: '', status: 401 });
await check('A8 import menu: upload step', `${A}/import/menu`, { has: ['Upload and check', 'Download a sample CSV', 'Category, Name, Description, Price', 'Nothing is saved until you confirm'] });
await check('A9 import wines: upload step', `${A}/import/wines`, { has: ['Upload and check', 'Producer, Wine, Vintage, Region, Grape, Style, Glass price, Bottle price'] });
await check('A10 setup', `${A}/setup`, { has: ['Checklist', 'Restaurant details', 'Import your menu', 'Print the QR code', 'Pairing suggestions', 'Generate suggestions'] });
await check('A10 setup: the wine director only views the details', `${A}/setup`, { has: ['Only the owner or general manager changes these details'], hasNot: ['Save details'] });
await check('A12 QR page', `${A}/qr`, { has: ['QR code', 'Print table tent', 'PNG 1024 px', 'SVG', 'QR code that opens', `/r/${slug}`] });
await check('sample menu CSV is public', '/api/v1/import-samples/menu', { cookie: '', has: ['category,name,description,price'] });
await check('sample wines CSV is public', '/api/v1/import-samples/wines', { cookie: '', has: ['producer,wine,vintage'] });
await check('unknown sample', '/api/v1/import-samples/sales', { cookie: '', status: 404 });

const qrUrl = `/api/v1/restaurants/${slug}/qr`;
const svg = await fetch(`${base}${qrUrl}?format=svg`, { headers: { cookie: SESSION } });
const svgText = await svg.text();
expect('QR as SVG', svg.status === 200 && /image\/svg\+xml/.test(svg.headers.get('content-type') ?? '') && svgText.includes('<svg'), `${svg.status} ${svg.headers.get('content-type')}`);
const png = async (q) => { const r = await fetch(`${base}${qrUrl}?${q}`, { headers: { cookie: SESSION } }); const b = Buffer.from(await r.arrayBuffer()); return { r, b, width: b.readUInt32BE(16) }; };
const p1 = await png('format=png');
expect('QR as PNG (real PNG, default 1024 px, attachment on request)', p1.r.status === 200 && p1.b.subarray(1, 4).toString() === 'PNG' && p1.width === 1024, `${p1.r.status} width ${p1.width}`);
expect('QR size is clamped: 10 px becomes 128, a huge size becomes 4096', (await png('format=png&size=10')).width === 128 && (await png('format=png&size=99999')).width === 4096);
const dl = await fetch(`${base}${qrUrl}?format=svg&download=1`, { headers: { cookie: SESSION } });
expect('QR download has an attachment filename', /attachment; filename="wine-match-halka\.svg"/.test(dl.headers.get('content-disposition') ?? ''), dl.headers.get('content-disposition'));
await check('QR with an unknown format', `${qrUrl}?format=gif`, { cookie: SESSION, status: 422 });
await check('QR of a restaurant the user cannot access', '/api/v1/restaurants/nope/qr', { cookie: SESSION, status: 403 });

const upload = async (kind, name, content, headers = write()) => {
  const fd = new FormData();
  if (content !== null) fd.append('file', new Blob([content]), name);
  const res = await fetch(`${base}/api/v1/imports/${kind}?restaurant=${slug}`, { method: 'POST', headers, body: fd });
  const text = await res.text();
  return { res, text, body: (() => { try { return JSON.parse(text); } catch { return {}; } })() };
};
const CSV = 'category,name,description,price\nStarters,Smoke test dish,Tasting,"46,50 zł"\n,Smoke test two,,abc\nMains,Duck breast,Changed text,118\n';
const up = await upload('menu', 'smoke.csv', CSV);
expect('upload a CSV: 201 with a preview', up.res.status === 201 && up.body.status === 'preview_ready' && up.body.summary?.total === 3, `${up.res.status} ${up.text.slice(0, 200)}`);
const rowsOf = up.body.rows ?? [];
expect('the preview normalises, flags and recognises existing dishes', rowsOf[0]?.fields.price === '46.5' && rowsOf[0].include === true && rowsOf[1]?.issues.some((i) => i.level === 'error' && i.field === 'price') && rowsOf[1].include === false && rowsOf[2]?.action === 'update' && rowsOf[2].include === false && up.body.summary.withErrors === 1 && up.body.summary.updates === 1, JSON.stringify(up.body.summary));
const jobUrl = `/api/v1/imports/${up.body.id}?restaurant=${slug}`;
await check('read the preview back', jobUrl, { cookie: SESSION, has: ['Smoke test dish', 'preview_ready'] });
await check('the preview is also shown in the dashboard', `${A}/import/menu?job=${up.body.id}`, { has: ['Check and correct', 'Smoke test dish', 'Import 1 dish', 'Check again', 'Cancel import', 'smoke.csv'] });
await check('the import preview in Polish: issues translated by code, values quoted', `${A}/import/menu?job=${up.body.id}`, { cookie: `${SESSION}; wm_lang=pl`, has: ['2. Sprawdź i popraw', 'Popraw: ', '„abc” nie jest ceną.', 'Już jest w menu', 'Importuj 1 danie'], hasNot: ['is not a price', 'Check and correct'] });
await check('correct a row: the error goes and the row is ticked', `/api/v1/imports/${up.body.id}/rows?restaurant=${slug}`, { method: 'PATCH', body: { rows: [{ rowNumber: 2, fields: { price: '52,00', name: 'Smoke test three' } }] }, headers: write(), has: ['"price":"52"', '"withErrors":0'] });
await check('rows body is validated', `/api/v1/imports/${up.body.id}/rows?restaurant=${slug}`, { method: 'PATCH', body: { rows: 'x' }, headers: write(), status: 422 });
await check('an unknown row is refused', `/api/v1/imports/${up.body.id}/rows?restaurant=${slug}`, { method: 'PATCH', body: { rows: [{ rowNumber: 99, include: true }] }, headers: write(), status: 422, has: ['unknown_row'] });
await check('uploading needs the CSRF token', `/api/v1/imports/menu?restaurant=${slug}`, { method: 'POST', cookie: SESSION, status: 403 });
await check('cancel the import', jobUrl, { method: 'DELETE', headers: write(), status: 204 });
await check('a cancelled import stays visible as cancelled', jobUrl, { cookie: SESSION, has: ['cancelled'] });
await check('a cancelled import cannot be corrected', `/api/v1/imports/${up.body.id}/rows?restaurant=${slug}`, { method: 'PATCH', body: { rows: [{ rowNumber: 1, include: false }] }, headers: write(), status: 422, has: ['job_closed'] });
await check('a cancelled import cannot be confirmed', `/api/v1/imports/${up.body.id}/confirm?restaurant=${slug}`, { method: 'POST', headers: write(), status: 422, has: ['job_closed'] });
await check('an import of another restaurant is not found', `/api/v1/imports/${up.body.id}?restaurant=nope`, { cookie: SESSION, status: 403 });

const refused = [
  ['a Word file', 'menu', 'menu.docx', 'x', 'unsupported_format'],
  ['an old .xls file', 'menu', 'menu.xls', 'x', 'legacy_xls'],
  ['text pretending to be a spreadsheet', 'menu', 'menu.xlsx', 'just text', 'format_mismatch'],
  ['a CSV with a header and no rows', 'menu', 'menu.csv', 'name,price\n', 'no_rows']
];
for (const [label, kind, name, content, code] of refused) {
  const r = await upload(kind, name, content);
  expect(`upload refused: ${label}`, r.res.status === 422 && r.body.error?.code === code, `${r.res.status} ${r.text.slice(0, 120)}`);
}
const empty = await upload('menu', 'empty.csv', '');
expect('upload refused: an empty file', empty.res.status === 422 && empty.body.error?.code === 'empty_file', `${empty.res.status} ${empty.text.slice(0, 120)}`);
const nofile = await upload('menu', 'x', null);
expect('upload refused: no file at all', nofile.res.status === 422, `${nofile.res.status}`);
await check('upload to an unknown kind', `/api/v1/imports/sales?restaurant=${slug}`, { method: 'POST', headers: write(), body: undefined, status: 404 });

// a wine list through the same door, as the general manager (who may import and edit the restaurant)
const WINES_CSV = 'producer;wine;vintage;style;glass;bottle\nSmoke Winery;Test Riesling;2022;Białe;48;210\n';
const gmUp = await upload('wines', 'smoke-wines.csv', WINES_CSV, gmw);
expect('the general manager can upload a wine list (semicolons, Polish headings)', gmUp.res.status === 201 && gmUp.body.rows?.[0]?.fields.style === 'white' && gmUp.body.rows[0].fields.glassPrice === '48' && gmUp.body.rows[0].include === true, `${gmUp.res.status} ${gmUp.text.slice(0, 200)}`);
await check('and cancel it', `/api/v1/imports/${gmUp.body.id}?restaurant=${slug}`, { method: 'DELETE', headers: gmw, status: 204 });
await check('the general manager may edit the restaurant details', `/admin/${slug}/setup`, { cookie: GM, has: ['Save details', 'Changing the address name stops every printed QR code from working'], hasNot: ['Only the owner or general manager changes these details'] });
await check('the general manager sees the QR code', `/admin/${slug}/qr`, { cookie: GM, has: ['Print table tent'] });

const waiter = await apiLogin('kelner@halka.pl', PASSWORD);
expect('a waiter has no dashboard access: right password, 403, no cookie', waiter.res.status === 403 && waiter.body.error?.code === 'no_panel_access' && waiter.setCookie.length === 0, `${waiter.res.status} ${waiter.text}`);
await check('the waiter pairing lookup stays public', `/r/${slug}/staff?dish=${duck}`, { cookie: '', has: ['Say:'] });

// --- dashboard (read-only screens of Phase 2)
await check('admin root redirects to the dashboard', '/admin', { has: ['Dashboard', 'Sommelier-led dishes'] });
await check('A1 dashboard', A, { has: ['Dashboard', 'Sommelier-led dishes', 'Published dishes', 'Wines on the list', 'Approved pairings', 'engine suggestions are waiting', 'No guests have used Wine Match yet', 'Review queue', 'Recommended for your dish', '<details data-explain="dashboard"', 'What do these tiles count?'], hasNot: [...OLD_LABELS, ' open=""'] });
await check('A2 menu', `${A}/menu`, { has: ['Beef tartare', 'Draft, needs check', 'to review', 'Published', 'Filter', 'data-explain="menu"', 'How does a taste profile affect pairings?'] });
await check('A2 menu: text filter', `${A}/menu?q=porcini`, { has: ['Wild mushroom risotto'], hasNot: ['Beef tartare'] });
await check('A2 menu: category filter', `${A}/menu?category=Desserts`, { has: ['Dark chocolate tart'], hasNot: ['Duck breast'] });
await check('A2 menu: no results', `${A}/menu?q=zzzz`, { has: ['No dishes found', 'Try another search or category.'] });
await check('A3 dish details', `${A}/menu/${duck}`, { has: ['Duck breast', 'Top matches with this profile', 'Taste profile', 'Manage pairings', 'View as guest', 'Translations', 'name="name_pl"', 'value="Pierś z kaczki"', 'name="description_en"', 'Save translations', 'data-explain="score"', 'How does the engine score a pairing?', 'Every pairing starts at 72'] });
await check('A3 unknown dish', `${A}/menu/00000000-0000-4000-8000-000000000000`, { status: 404 });
await check('A4 wine list', `${A}/wines`, { has: ['Wine list', '19 active wines', 'Hidden', 'Bottle only', 'Hochar', 'data-explain="wines"', 'What does hiding a wine do?'] });
await check('A4 wine list: style filter', `${A}/wines?style=sweet`, { has: ['Royal Tokaji'], hasNot: ['Marcel Lapierre'] });
await check('A4 wine list: no results', `${A}/wines?q=zzzz`, { has: ['No wines found'] });
const list = await (await fetch(`${base}${A}/wines`, { headers: { cookie: SESSION } })).text();
const hidden = /href="[^"]*\/wines\/([0-9a-f-]{36})"[^>]*>Château Musar/.exec(list)?.[1];
if (hidden) await check('A5 wine details of a hidden wine', `${A}/wines/${hidden}`, { has: ['Hidden from guests', 'Château Musar'] });
await check('A5 wine details', `${A}/wines/${wine}`, { has: ['Listing and prices', 'Best dishes for this wine', 'Wine profile', 'Approved pairings', 'Duck breast', 'Translations', 'name="tastingNote_pl"', 'name="country_en"', 'data-explain="score"'] });
await check('A5 unknown wine', `${A}/wines/00000000-0000-4000-8000-000000000000`, { status: 404 });
await check('A6 pairings index redirects to a dish', `${A}/pairings`, { has: ['What guests see now', 'Approved for guests'] });
await check('A6 pairings of a dish', `${A}/pairings/${duck}`, { has: ['Pairings: Duck breast', 'Sommelier approved', 'Primary', 'What guests see now', 'Sommelier’s pairing', '<span class="sr-only"> Engine match score</span>', 'data-explain="pairings"', 'How do guests see your pairings?', 'data-explain="suggestions"', '<span class="sr-only">How do guests see engine suggestions?</span>'], hasNot: [...OLD_LABELS, 'title="Engine match score"'] });
await check('A7 review queue', `${A}/review`, { has: ['Review queue', 'dishes have at least one approved pairing', 'suggestions left', 'Open pairings', 'role="progressbar"', 'aria-valuenow', 'data-explain="review"', 'What does approving do?'], hasNot: ['data-state="indeterminate"', ...OLD_LABELS] });
await check('A11 publish: the engine’s label for unreviewed suggestions', `${A}/publish`, { has: ['Guest settings', 'data-explain="publish"', 'What do these settings change?', 'The “Whole table” bottle still comes from the whole list.'], hasNot: [...OLD_LABELS, 'When off, guests only see pairings you approved.'] });
await check('a restaurant the user has no access to: 403', '/admin/nope', { status: 403 });
await check('dashboard uses no guest wording', A, { hasNot: ['AI recommendation', 'Powered by AI'] });

await check('A11 publish', `${A}/publish`, { has: ['Before you publish', 'Guest settings', 'Fill empty places with engine picks', 'Publish changes', 'Last published'] });
await check('A6 has the decision controls', `${A}/pairings/${duck}`, { has: ['Approved for guests', 'Engine suggestions', 'Add your own pairing', 'History', 'Set role'] });
await check('flash: saved', `${A}/pairings/${duck}?saved=approved`, { has: ['Pairing approved.'] });
await check('flash: version conflict', `${A}/pairings/${duck}?error=version_conflict`, { has: ['changed by someone else'] });
await check('flash: unknown codes show no message', `${A}/pairings/${duck}?saved=zzz`, { hasNot: ['Pairing approved.', 'Not saved'] });
await check('A7 review has approve controls', `${A}/review`, { has: ['Approve all', 'Approve', 'Reject'] });
await check('A4 wine list has availability controls', `${A}/wines`, { has: ['Hide', 'Show'] });
await check('dashboard nav has Publish', A, { has: ['Publish'] });
await check('publish page of a restaurant without access: 403', '/admin/nope/publish', { status: 403 });

// --- dashboard in Polish (spec 2026-10-15-polish-language, phase 2): wm_lang cookie, then Accept-Language, then English
const PLC = `${SESSION}; wm_lang=pl`;
await check('A0 sign-in in Polish from Accept-Language', '/admin/login', { cookie: '', headers: PL, has: ['<html lang="pl"', 'Zaloguj się', 'Służbowy e-mail', 'Hasło', 'aria-label="Język panelu"', 'name="lang"'], hasNot: ['Work e-mail'] });
await check('A0 sign-in in English without a header or cookie', '/admin/login', { cookie: '', has: ['<html lang="en"', 'Work e-mail', 'aria-label="Dashboard language"'], hasNot: ['Służbowy e-mail'] });
await check('A0 sign-in: the cookie wins over the browser', '/admin/login', { cookie: 'wm_lang=en', headers: PL, has: ['<html lang="en"', 'Work e-mail'] });
await check('A0 Polish error message by code', '/admin/login?error=invalid_credentials', { cookie: '', headers: PL, has: ['Nieprawidłowy e-mail lub hasło'] });
await check('A1 dashboard with wm_lang=pl', A, { cookie: PLC, headers: { 'accept-language': 'en-GB' }, has: ['<html lang="pl"', 'Pulpit', 'Karta win', 'Parowania', 'Do przeglądu', 'Publikacja', 'Kod QR', 'Ustawienia', 'Wyloguj', 'Dania z parowaniem sommeliera', 'Wymaga uwagi', 'aria-current="true"', '<title>Pulpit | Panel Wine Match</title>'], hasNot: ['Sign out', 'Sommelier-led dishes'] });
await check('A2 menu in Polish', `${A}/menu`, { cookie: PLC, has: ['Szukaj dań', 'Przystawki', 'Szkic, do sprawdzenia', 'Opublikowane', '<title>Menu | Panel Wine Match</title>'] });
await check('A4 wine list in Polish: styles, prices with NBSP', `${A}/wines`, { cookie: PLC, has: ['Karta win', 'Tylko butelka', 'Czerwone', '\u00a0zł', 'Ukryj'] });
await check('A6 pairings in Polish: roles, flash by code, Polish engine reasons', `${A}/pairings/${duck}?saved=approved`, { cookie: PLC, has: ['Parowanie zatwierdzone.', 'Zatwierdzone dla gości', 'Podstawowe', 'Najlepsza cena', 'Propozycje silnika', 'Co teraz widzą goście', 'Ustaw rolę', 'Jak gość widzi Twoje pary?', 'Gość widzi najwyżej 4 wina.'], hasNot: ['Approved for guests', 'Set role', ...OLD_LABELS] });
await check('A6 Polish error flash by code', `${A}/pairings/${duck}?error=version_conflict`, { cookie: PLC, has: ['Nie zapisano', 'Ktoś przed chwilą zmienił to parowanie'] });
await check('A7 review queue in Polish', `${A}/review`, { cookie: PLC, has: ['Do przeglądu', 'Zatwierdź', 'Odrzuć', 'Otwórz parowania', 'para sommeliera'], hasNot: OLD_LABELS });
await check('A3 dish in Polish: content in the panel language', `${A}/menu/${duck}`, { cookie: PLC, has: ['Pierś z kaczki', 'Tłumaczenia', 'Zapisz tłumaczenia'] });
await check('A6 note form in Polish has PL and EN fields', `${A}/pairings/${duck}`, { cookie: PLC, has: ['name="comment_pl"', 'name="comment_en"', 'Pinot noir i sos wiśniowy'] });
await check('A10 content language and translations', `${A}/setup`, { has: ['Content language and translations', 'name="contentLocale"', 'name="city_pl"', 'value="Warszawa"'] });
await check('A1 panel has the language switch at the top', A, { has: ['aria-label="Polski"', 'aria-label="English"', '>Polski<', '>English<'] });
await check('A10 setup in Polish', `${A}/setup`, { cookie: PLC, has: ['Lista kroków', 'Dane restauracji', 'Zaimportuj menu', 'Wydrukuj kod QR', 'W szkicu: 4 z 15 profili dań.'] });
await check('A11 publish in Polish', `${A}/publish`, { cookie: PLC, has: ['Przed publikacją', 'Opublikuj zmiany', 'Ostatnia publikacja:', 'Co zmieniają te ustawienia?', 'z całej karty'], hasNot: OLD_LABELS });
await check('A12 QR in Polish', `${A}/qr`, { cookie: PLC, has: ['Kod QR', 'Drukuj stojak na stolik'] });
await check('guest pages ignore wm_lang (no cookies for guests)', R, { cookie: 'wm_lang=pl', has: ['<html lang="en"', 'Pick your dish'], hasNot: ['Wybierz danie'] });
// the switch is a plain form post to a server action: no JavaScript, no session needed
const loginHtml = await (await fetch(`${base}/admin/login`)).text();
const langAction = /name="(\$ACTION_ID_[0-9a-f]+)"\/><input type="hidden" name="back"/.exec(loginHtml)?.[1];
expect('the language switch is a server-action form on the sign-in page', !!langAction, 'no action id before the back field');
if (langAction) {
  const post = async (fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fetch(`${base}/admin/login`, { method: 'POST', body: fd, redirect: 'manual' });
  };
  const sw = await post({ [langAction]: '', lang: 'pl', back: `/admin/login?next=${encodeURIComponent(`/admin/${slug}/review`)}` });
  const sc = sw.headers.getSetCookie?.().join(' | ') ?? '';
  expect('switching to PL sets wm_lang=pl (SameSite=Lax, a year, /admin) and goes back', sw.status === 303 && /wm_lang=pl/.test(sc) && /SameSite=lax/i.test(sc) && /Max-Age=31536000/.test(sc) && /Path=\/admin/.test(sc) && !/wm_session/.test(sc) && (sw.headers.get('location') ?? '') === `/admin/login?next=${encodeURIComponent(`/admin/${slug}/review`)}`, `${sw.status} ${sc} ${sw.headers.get('location')}`);
  const evil = await post({ [langAction]: '', lang: 'xx', back: 'https://evil.example/' });
  expect('the switch ignores an unknown language and a foreign address', evil.status === 303 && !(evil.headers.getSetCookie?.() ?? []).some((c) => c.startsWith('wm_lang')) && evil.headers.get('location') === '/admin', `${evil.status} ${evil.headers.get('location')}`);
}

await check('sign out', '/api/v1/auth/logout', { method: 'POST', headers: write(), status: 204 });
await check('after sign-out the old session is dead', '/api/v1/auth/me', { cookie: SESSION, status: 401 });
await check('after sign-out the dashboard asks to sign in again', `/admin/${slug}`, { cookie: SESSION, redirect: 'manual', status: 307, location: '/admin/login' });
await check('the other (manager) session is unaffected', '/api/v1/auth/me', { cookie: GM, has: ['manager'] });

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
