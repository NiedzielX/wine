/* eslint-disable no-console -- measurement scripts print their results */
// Panel at 390 px: top bar nav (horizontal strip). Is the active tab kept in view after navigation? Does it jump?
import { run, ctx, login, nav, BASE } from './probe.mjs';
await run(async (b) => {
  const c = await ctx(b, 390, 800); const page = await c.newPage(); await login(page);
  await page.goto(BASE + '/admin/halka?lang=en'); await page.waitForLoadState('networkidle');
  const info = () => page.evaluate(() => { const n = document.querySelector('aside nav'); const a = n.querySelector('a[aria-current=page]'); const r = a && a.getBoundingClientRect(); return { navScrollLeft: Math.round(n.scrollLeft), navClientW: n.clientWidth, navScrollW: n.scrollWidth, activeLeft: r && Math.round(r.left), activeRight: r && Math.round(r.right), activeVisible: r ? r.left >= 0 && r.right <= innerWidth : null, docScrollW: document.documentElement.scrollWidth, asideH: Math.round(document.querySelector('aside').getBoundingClientRect().height) }; });
  console.log('start', JSON.stringify(await info()));
  for (const to of ['menu', 'wines', 'review', 'publish', 'qr']) {
    // bring the link into view the way a thumb would (scroll the strip), then tap it
    await page.evaluate((t) => { const a = document.querySelector(`aside a[href$="/admin/halka/${t}"]`); a.scrollIntoView({ inline: 'center', block: 'nearest' }); }, to);
    await page.waitForTimeout(150);
    const before = await info();
    await nav(page, `aside a[href$="/admin/halka/${to}"]`, '390 tap ' + to);
    console.log('   strip before', JSON.stringify(before), '\n   strip after ', JSON.stringify(await info()));
  }
});
