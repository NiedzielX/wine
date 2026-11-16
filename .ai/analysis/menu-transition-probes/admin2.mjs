/* eslint-disable no-console -- measurement scripts print their results */
// Scenario B: short viewport so the sidebar itself scrolls; scroll it down, click a lower item; also dwell on list scroll position.
import { run, ctx, login, nav, BASE } from './probe.mjs';
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 640);
await run(async (b) => {
  const c = await ctx(b, W, H); const page = await c.newPage(); await login(page);
  await page.goto(BASE + '/admin/halka/menu?lang=en'); await page.waitForLoadState('networkidle');
  console.log('viewport', W, H, await page.evaluate(() => { const a = document.querySelector('aside'); return { asideScrollH: a.scrollHeight, asideClientH: a.clientHeight, docScrollH: document.documentElement.scrollHeight }; }));
  // scroll the page a bit, and the sidebar to the bottom
  await page.evaluate(() => { window.scrollTo(0, 300); document.querySelector('aside').scrollTop = 9999; });
  await page.waitForTimeout(200);
  console.log('after manual scroll', await page.evaluate(() => ({ sy: scrollY, ast: document.querySelector('aside').scrollTop })));
  await nav(page, `aside a[href$="/admin/halka/qr"]`, 'sidebar scrolled -> qr');
  await page.evaluate(() => { document.querySelector('aside').scrollTop = 9999; });
  await nav(page, `aside a[href$="/admin/halka/setup"]`, 'sidebar scrolled -> setup');
  await nav(page, `aside a[href$="/admin/halka/wines"]`, 'sidebar scrolled -> wines (list w/ loading)');
  await page.screenshot({ path: process.env.SHOT ?? '/tmp/claude-0/-home-user/8279e2f1-e960-5810-afbc-145c726afeb3/scratchpad/m/b.png' });
});
