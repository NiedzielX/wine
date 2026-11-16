/* eslint-disable no-console -- measurement scripts print their results */
// Probes for .ai/specs/2026-11-16-menu-transition-smoothness.md. Usage: build the app, start `next start -p 3111` with DATA_SOURCE=memory
// (+ AUTH_COOKIE_SECURE=false ALLOW_DEMO_DATA=true ALLOW_LOCAL_BASE_URL=true), then `[DELAY=600] [W=1440 H=900] node admin3.mjs`.
// Playwright comes from /opt/node-tools; Chromium is started WITHOUT --hide-scrollbars on purpose (classic 15 px scrollbar).
import { createRequire } from 'node:module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
export const BASE = 'http://localhost:3111';
const delay = Number(process.env.DELAY ?? 0); // ms added to every document / RSC response

const INIT = `
window.__ls = []; window.__frames = []; window.__rec = false;
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__ls.push({ v: e.value, in: e.hadRecentInput, t: e.startTime, srcs: e.sources.map(s => (s.node && (s.node.nodeName + '.' + (s.node.className||'').toString().slice(0,40))) + ' ' + JSON.stringify(s.previousRect) + '->' + JSON.stringify(s.currentRect)) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
window.__start = () => { window.__frames = []; window.__rec = true; const t0 = performance.now(); const tick = () => { if (!window.__rec) return; const a = document.querySelector('aside'); const m = document.querySelector('main'); const sk = !!document.querySelector('[role=status],[aria-busy=true]');
  window.__frames.push({ t: Math.round(performance.now() - t0), aside: a ? { top: Math.round(a.getBoundingClientRect().top), st: a.scrollTop, w: Math.round(a.getBoundingClientRect().width) } : null, main: m ? Math.round(m.getBoundingClientRect().width) : null, sy: Math.round(scrollY), sh: document.documentElement.scrollHeight, cw: document.documentElement.clientWidth, h1: (document.querySelector('h1')||{}).textContent, skel: sk, path: location.pathname + location.search }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
window.__stop = () => { window.__rec = false; };
`;

export async function run(fn) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--no-sandbox'] });
  try { await fn(browser); } finally { await browser.close(); }
}
export async function ctx(browser, w, h) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  await c.addInitScript(INIT);
  if (delay) await c.route('**/*', async (r) => { const t = r.request().resourceType(); if (t === 'document' || t === 'fetch') await new Promise(res => setTimeout(res, delay)); await r.continue(); });
  return c;
}
export async function login(page) {
  const res = await fetch(BASE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'marta@halka.pl', password: 'demo-halka-2026' }) });
  const tok = /wm_session=([^;]+)/.exec(res.headers.get('set-cookie'))[1];
  await page.context().addCookies([{ name: 'wm_session', value: tok, url: BASE }]);
}
/** click `sel`, record frames until settled. */
export async function nav(page, sel, label, wait = 1200) {
  await page.evaluate(() => { window.__ls.length = 0; });
  const before = await page.evaluate(() => ({ sy: scrollY, ast: (document.querySelector('aside') || {}).scrollTop, navL: (document.querySelector('aside nav') || {}).scrollLeft, cw: document.documentElement.clientWidth }));
  await page.evaluate(() => window.__start());
  await page.click(sel);
  await page.waitForTimeout(wait);
  const r = await page.evaluate(() => { window.__stop(); return { frames: window.__frames, ls: window.__ls }; });
  const f = r.frames;
  const cls = r.ls.filter(e => !e.in).reduce((a, e) => a + e.v, 0); const raw = r.ls.reduce((a, e) => a + e.v, 0);
  const cws = [...new Set(f.map(x => x.cw))];
  const asideTops = [...new Set(f.map(x => x.aside && x.aside.top))];
  const asideSt = f.map(x => x.aside ? x.aside.st : null);
  const asideMissing = f.filter(x => !x.aside).length;
  const skelFrames = f.filter(x => x.skel).length;
  const lastSy = f[f.length - 1].sy;
  const h1s = [...new Set(f.map(x => x.h1))];
  const path = f[f.length - 1].path;
  console.log(JSON.stringify({ label, path, cls: +cls.toFixed(4), rawShift: +raw.toFixed(4), clientWidths: cws, asideTops, asideScrollTopSeq: [...new Set(asideSt)], asideMissingFrames: asideMissing, skelFrames, frames: f.length, scrollY: [before.sy, lastSy], asideScrollTopBefore: before.ast, navScrollLeftBefore: before.navL, h1s }));
  if (process.env.V) console.log(JSON.stringify(r.ls.filter(e => !e.in)));
  return r;
}
