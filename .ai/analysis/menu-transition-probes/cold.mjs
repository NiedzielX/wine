/* eslint-disable no-console -- measurement scripts print their results */
// Cold page loads (fonts, images): CLS of the first paint, fresh browser context each time (no cache).
import { run, ctx, login, BASE } from './probe.mjs';
await run(async (b) => {
  for (const [W, H] of [[390, 844], [1440, 900]]) {
    for (const [name, url, auth] of [['guest menu', '/r/halka/menu?lang=en', false], ['guest dish', '/r/halka/dish/6aae1366-03c6-8a1e-8d99-3ac275d7ce56/wines?lang=en', false], ['admin dashboard', '/admin/halka?lang=en', true], ['admin review', '/admin/halka/review?lang=en', true]]) {
      const c = await ctx(b, W, H); const p = await c.newPage(); if (auth) await login(p);
      await p.goto(BASE + url); await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
      const r = await p.evaluate(() => ({ cls: window.__ls.reduce((a, e) => a + e.v, 0), n: window.__ls.length, src: window.__ls.filter(e=>e.v>0.02).map(e=>e.t.toFixed(0)+'ms '+e.srcs.slice(0,3).join(' | ').slice(0,400)), fonts: [...document.fonts].filter((f) => f.status === 'loaded').length }));
      console.log(String(W).padEnd(5), name.padEnd(16), 'cold CLS', r.cls.toFixed(4), 'entries', r.n, 'fonts loaded', r.fonts); if (r.src.length) console.log('     ', r.src.join('\n      '));
      await c.close();
    }
  }
});
