/* eslint-disable no-console -- measurement scripts print their results */
// Guest app, clean flows. Each flow starts from a fresh page so history is unambiguous.
import { run, ctx, BASE } from './probe.mjs';
const W = Number(process.env.W ?? 390), H = Number(process.env.H ?? 844);
const DISH = '6aae1366-03c6-8a1e-8d99-3ac275d7ce56';

async function timeline(page, label, action, wait = 1200) {
  await page.evaluate(() => {
    window.__ls.length = 0; window.__tl = []; window.__go = performance.now(); window.__run = true;
    const tick = () => { if (!window.__run) return;
      window.__tl.push({ t: Math.round(performance.now() - window.__go), path: location.pathname.replace('/r/halka', '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '<id>') + location.search.replace(/&?sid=[^&]*/, ''), sy: Math.round(scrollY), cw: document.documentElement.clientWidth, docH: document.documentElement.scrollHeight });
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await action();
  await page.waitForTimeout(wait);
  const r = await page.evaluate(() => { window.__run = false; return { tl: window.__tl, ls: window.__ls }; });
  const ev = []; let prev = null;
  for (const f of r.tl) { const k = JSON.stringify([f.path, f.sy, f.cw, Math.round(f.docH / 20)]); if (k !== prev) { ev.push(f); prev = k; } }
  const raw = r.ls.reduce((a, e) => a + e.v, 0);
  console.log(`--- ${label}  layoutShift=${raw.toFixed(4)} (${r.ls.length} entries)`);
  for (const f of ev.slice(0, 10)) console.log(`   t=${f.t}ms ${f.path} scrollY=${f.sy} clientW=${f.cw} docH=${f.docH}`);
  if (process.env.V) for (const e of r.ls) console.log('   shift', e.v.toFixed(4), e.in ? '(input)' : '', e.srcs.slice(0, 2).join(' | '));
}
const fresh = async (b, url) => { const c = await ctx(b, W, H); const page = await c.newPage(); await page.goto(BASE + url); await page.waitForLoadState('networkidle'); return page; };

await run(async (b) => {
  console.log('=== guest viewport', W, H);
  let p = await fresh(b, '/r/halka/menu?lang=en');
  console.log('scrollbar width', await p.evaluate(() => innerWidth - document.documentElement.clientWidth), 'docH', await p.evaluate(() => document.documentElement.scrollHeight));
  const t = p.locator('a[href*="/dish/"]').nth(8); await t.scrollIntoViewIfNeeded(); await p.waitForTimeout(200);
  console.log('menu scrollY before tap:', await p.evaluate(() => scrollY));
  await timeline(p, 'menu(scrolled) -> dish', () => t.click());
  await timeline(p, 'dish -> browser back to menu', () => p.goBack());
  console.log('   menu scrollY after browser back:', await p.evaluate(() => scrollY));
  await p.close();

  p = await fresh(b, '/r/halka/menu?lang=en');
  const t2 = p.locator('a[href*="/dish/"]').nth(8); await t2.scrollIntoViewIfNeeded(); await t2.click(); await p.waitForURL(/dish/); await p.waitForTimeout(300);
  await timeline(p, 'dish -> menu via TOP-BAR BACK LINK', () => p.click('header.sticky a[aria-label]'));
  console.log('   menu scrollY after back link:', await p.evaluate(() => scrollY));
  await p.close();

  p = await fresh(b, `/r/halka/dish/${DISH}/wines?lang=en`);
  console.log('dish docH', await p.evaluate(() => document.documentElement.scrollHeight));
  await p.evaluate(() => scrollTo(0, 200)); await p.waitForTimeout(150);
  await timeline(p, 'dish: style chip red (scroll=false), scrolled 200', () => p.click('a[href*="styles=red"]'));
  await timeline(p, 'dish: serving glass chip', () => p.click('a[href*="serving=glass"]'));
  await p.evaluate(() => scrollTo(0, 0));
  await timeline(p, 'dish: open filters sheet', () => p.click('a[href*="sheet=filters"]'));
  await p.close(); p = await fresh(b, `/r/halka/dish/${DISH}/wines?lang=en`);
  const wl = p.locator('a[href*="/wine/"]').first(); await wl.scrollIntoViewIfNeeded();
  await timeline(p, 'dish -> wine', () => wl.click());
  await timeline(p, 'wine -> browser back', () => p.goBack());
  console.log('   dish scrollY after back', await p.evaluate(() => scrollY));
  await p.close();

});
