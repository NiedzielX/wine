/* eslint-disable no-console -- measurement scripts print their results */
import { run, ctx, login, nav } from './probe.mjs';
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 800);
await run(async (b) => {
  const c = await ctx(b, W, H); const page = await c.newPage(); await login(page);
  await page.goto('http://localhost:3111/admin/halka?lang=en'); await page.waitForLoadState('networkidle');
  console.log('viewport', W, H, 'aside scrollHeight/clientHeight/scrollbarW', await page.evaluate(() => { const a = document.querySelector('aside'); return [a.scrollHeight, a.clientHeight, innerWidth - document.documentElement.clientWidth]; }));
  const links = ['menu', 'wines', 'pairings', 'review', 'opportunities', 'publish', 'import/menu', 'setup', 'qr', ''];
  for (const l of links) await nav(page, `aside a[href$="/admin/halka${l ? '/' + l : ''}"]`, 'nav ' + (l || 'dashboard'));
});
