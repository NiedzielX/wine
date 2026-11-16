/* eslint-disable no-console -- measurement scripts print their results */
// Timeline of one navigation: when does the active link change, when does the skeleton show, when does the real page show,
// and how far do right-aligned elements (language switch) / content width jump.
import { run, ctx, login, BASE } from './probe.mjs';
const W = Number(process.env.W ?? 1440), H = Number(process.env.H ?? 800);
const pairs = [['wines', 'menu'], ['review', 'wines'], ['opportunities', 'review'], ['publish', 'opportunities'], ['qr', 'wines'], ['', 'review']];
await run(async (b) => {
  const c = await ctx(b, W, H); const page = await c.newPage(); await login(page);
  await page.goto(BASE + '/admin/halka/menu?lang=en'); await page.waitForLoadState('networkidle');
  for (const [to] of pairs) {
    const sel = `aside a[href$="/admin/halka${to ? '/' + to : ''}"]`;
    await page.evaluate(() => {
      window.__tl = []; window.__go = performance.now(); window.__run = true;
      const tick = () => { if (!window.__run) return;
        const cur = document.querySelector('aside a[aria-current=page]');
        const lang = [...document.querySelectorAll('[aria-label]')].find((e) => /language|język/i.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0);
        window.__tl.push({ t: Math.round(performance.now() - window.__go), cur: cur && cur.getAttribute('href').replace('/admin/halka', '') || '', h1: (document.querySelector('h1') || {}).textContent || null, cw: document.documentElement.clientWidth, langRight: lang ? Math.round(lang.getBoundingClientRect().right) : null, docH: document.documentElement.scrollHeight });
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.click(sel);
    const click = await page.evaluate(() => Math.round(performance.now() - window.__go));
    await page.waitForTimeout(Number(process.env.DELAY ?? 0) * 2 + 1200);
    const tl = await page.evaluate(() => { window.__run = false; return window.__tl; });
    // compress into change events
    const ev = []; let prev = null;
    for (const f of tl) { const k = JSON.stringify([f.cur, f.h1, f.cw, f.langRight, Math.round(f.docH / 50)]); if (k !== prev) { ev.push(f); prev = k; } }
    console.log('--- click', to || 'dashboard', '(click returned at', click, 'ms)');
    for (const f of ev) console.log(`  t=${f.t}ms active=${f.cur} h1=${f.h1} clientWidth=${f.cw} langSwitchRight=${f.langRight} docH=${f.docH}`);
  }
});
