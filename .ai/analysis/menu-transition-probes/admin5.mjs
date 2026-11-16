/* eslint-disable no-console -- measurement scripts print their results */
// Write action in the panel (server action -> redirect ?saved=): scroll position, flash banner shift, sidebar counter.
import { run, ctx, login, BASE } from './probe.mjs';
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 800);
await run(async (b) => {
  const c = await ctx(b, W, H); const page = await c.newPage(); await login(page);
  await page.goto(BASE + '/admin/halka/pairings/0050b6dd-3e72-8012-bbc9-7f4f99f579d4?lang=en'); await page.waitForLoadState('networkidle');
  console.log('viewport', W, H, 'docH', await page.evaluate(() => document.documentElement.scrollHeight));
  const btn = page.locator('button:has-text("Save note")').last();
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Save note').pop(); window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 400); }); await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ sy: scrollY, btnTop: Math.round([...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Save note').pop().getBoundingClientRect().top), url: location.search }));
  await page.evaluate(() => { window.__ls.length = 0; window.__tl = []; window.__go = performance.now(); window.__run = true; const tick = () => { if (!window.__run) return; window.__tl.push({ t: Math.round(performance.now() - window.__go), sy: Math.round(scrollY), q: location.search.replace(/lang=en&?/, ''), docH: document.documentElement.scrollHeight, flash: !!document.querySelector('[role=status]:not([aria-label]),[role=alert]') }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await btn.evaluate((e) => e.click());
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => { window.__run = false; return { tl: window.__tl, ls: window.__ls }; });
  let prev = ''; for (const f of r.tl) { const k = JSON.stringify([f.sy, f.q, Math.round(f.docH / 10), f.flash]); if (k !== prev) { console.log(`  t=${f.t}ms scrollY=${f.sy} query=${f.q} docH=${f.docH} flash=${f.flash}`); prev = k; } }
  console.log('before', JSON.stringify(before), 'layoutShift raw', r.ls.reduce((a, e) => a + e.v, 0).toFixed(4), r.ls.map((e) => (e.in ? 'input ' : '') + e.v.toFixed(4)).join(','));
});
