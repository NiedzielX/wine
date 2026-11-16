/* eslint-disable no-console -- measurement scripts print their results */
// (1) chip scroll preservation without Playwright's own scrolling, (2) scrollbar toggle between guest pages at 1440, (3) language switch / reload cost.
import { run, ctx, BASE } from './probe.mjs';
const DISH = '6aae1366-03c6-8a1e-8d99-3ac275d7ce56';
await run(async (b) => {
  for (const [W, H] of [[390, 844], [1440, 1000]]) {
    const c = await ctx(b, W, H); const p = await c.newPage();
    console.log('=== viewport', W, H);
    await p.goto(BASE + `/r/halka/dish/${DISH}/wines?lang=en`); await p.waitForLoadState('networkidle');
    await p.evaluate(() => scrollTo(0, 150)); await p.waitForTimeout(150);
    const sy0 = await p.evaluate(() => scrollY);
    await p.evaluate(() => document.querySelector('a[href*="styles=red"]').click());
    await p.waitForTimeout(900);
    console.log('chip via DOM click: scrollY before/after', sy0, await p.evaluate(() => scrollY), await p.evaluate(() => location.search.replace(/sid=[^&]*&?/, '')));
    // scrollbar state across pages
    const pages = ['/r/halka?lang=en', '/r/halka/menu?lang=en', `/r/halka/dish/${DISH}/wines?lang=en`, '/r/halka/table?lang=en', '/r/halka/how-it-works?lang=en', '/r/halka/staff?lang=en'];
    for (const u of pages) { await p.goto(BASE + u); await p.waitForLoadState('networkidle'); console.log('  ', u.padEnd(66), 'docH', await p.evaluate(() => document.documentElement.scrollHeight), 'clientW', await p.evaluate(() => document.documentElement.clientWidth)); }
    await c.close();
  }
});
