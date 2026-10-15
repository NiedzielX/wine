import { DAILY, KPIS, PAIRING_PERFORMANCE, PERIOD, TOP_DISHES, TOP_RECOMMENDED, TOP_SELECTED } from '../../data/analytics';
import type { Dish, DishCategory, DishProfile, EntityStatus, Level, Wine, WineProfile, WineStyle } from '@wine-match/core';
import { pairingScore } from '@wine-match/core';
import { dishById, generateSuggestions, save, state, track, wineById } from '../../state/store';
import { STYLE_LABEL, esc, icon, toast, vintage, zl } from '../../ui/dom';
import { navigate, type View } from '../../ui/router';
import { adminShell, emptyBlock, head, requireLogin, statusBadge } from './shell';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const delta = (now: number, prev: number) => {
  const d = (now - prev) / prev;
  return `<div class="delta ${d < 0 ? 'neg' : ''}">${d >= 0 ? '+' : ''}${Math.round(d * 100)}% vs previous 28 days</div>`;
};

/* ------------------------------------------------------------------ Login */
export const login: View = {
  shell: 'plain',
  title: () => 'Sign in',
  render: () => `<div class="login">
    <section class="art">
      <a class="a-brand" href="#/" style="color:inherit"><span class="mark" style="background:var(--on-wine);color:var(--wine-deep)">${icon('glass', 18)}</span><b>Wine Match</b></a>
      <div><h1>Your list. Your pairings. Better nights for the cellar.</h1>
      <p style="margin-top:18px">Review the pairings guests see, keep the wine list current and follow how much wine your tables order.</p></div>
      <small style="opacity:.6">For restaurant teams</small>
    </section>
    <section class="form">
      <form novalidate>
        <h2>Sign in</h2>
        <label class="field"><span>Work email</span><input class="input" name="email" type="email" autocomplete="username" value="marta@halka.pl" required data-autofocus></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" value="demo-halka"></label>
        <label class="field"><span>Sign in as</span><select class="select" name="role"><option value="sommelier">Marta Wierzbicka, Wine Director</option><option value="manager">Tomasz Lis, General Manager</option></select></label>
        <p class="error-text" id="login-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        <p class="hint">Demo credentials are filled in. Any password with 6 or more characters works.</p>
      </form>
    </section>
  </div>`,
  mount: (root, _p, q) => {
    const form = root.querySelector('form')!;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = String(fd.get('email') ?? '').trim();
      const pw = String(fd.get('password') ?? '');
      const err = root.querySelector<HTMLElement>('#login-error')!;
      const emailInput = form.querySelector<HTMLInputElement>('[name=email]')!;
      const pwInput = form.querySelector<HTMLInputElement>('[name=password]')!;
      emailInput.removeAttribute('aria-invalid'); pwInput.removeAttribute('aria-invalid');
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Enter a valid work email.'; err.hidden = false; emailInput.setAttribute('aria-invalid', 'true'); return; }
      if (pw.length < 6) { err.textContent = 'Password must be at least 6 characters.'; err.hidden = false; pwInput.setAttribute('aria-invalid', 'true'); return; }
      const role = fd.get('role') === 'manager' ? 'manager' : 'sommelier';
      state.session = { staffName: role === 'manager' ? 'Tomasz Lis' : state.restaurant.wineDirector, role };
      save();
      track('staff_login', { role });
      navigate(`#${q.get('next') && q.get('next') !== '/admin/login' ? q.get('next') : '/admin'}`);
    });
  }
};

/* ------------------------------------------------------------------ Dashboard */
function lineChart(): string {
  const W = 760; const H = 190; const pad = 28;
  const max = Math.max(...DAILY.map((d) => d.sessions)) * 1.1;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (DAILY.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = (k: 'sessions' | 'selections') => DAILY.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Daily sessions and wine selections">
    ${[0, 0.5, 1].map((t) => `<line x1="${pad}" x2="${W - pad}" y1="${y(max * t / 1.1)}" y2="${y(max * t / 1.1)}" stroke="var(--line)"/>`).join('')}
    <path d="${path('sessions')}" fill="none" stroke="var(--wine)" stroke-width="2"/>
    <path d="${path('selections')}" fill="none" stroke="var(--brass)" stroke-width="2" stroke-dasharray="4 3"/>
    ${DAILY.filter((_, i) => i % 7 === 0).map((d, k) => `<text x="${x(k * 7)}" y="${H - 6}">${d.d.split('-').reverse().join('.')}</text>`).join('')}
  </svg>`;
}

export const dashboard: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Dashboard',
  render: (_p, q) => {
    const demo = q.get('demo');
    if (demo === 'loading') return adminShell(`${head('Dashboard', PERIOD.label)}<div class="a-kpis">${'<div class="a-kpi"><div class="skeleton" style="height:14px;width:60%"></div><div class="skeleton" style="height:34px;width:50%;margin-top:10px"></div></div>'.repeat(4)}</div>`);
    if (demo === 'empty') return adminShell(`${head('Dashboard', 'No guest activity yet')}<div class="panel">${emptyBlock('No guests have used Wine Match yet', 'Publish your pairings and place the QR code on tables. Numbers appear here after the first evening.', '<a class="btn btn-primary" href="#/admin/qr">Get the QR code</a>')}</div>`);
    const k = KPIS;
    const maxD = TOP_DISHES[0].lookups;
    const maxR = TOP_RECOMMENDED[0].shown;
    const maxS = TOP_SELECTED[0].selected;
    const suggested = state.pairings.filter((p) => p.status === 'suggested').length;
    return adminShell(`${head('Dashboard', `${PERIOD.label}. Sales figures from the POS export uploaded on 14 Oct.`, `<a class="btn" href="#/r/${state.restaurant.slug}" target="_blank" rel="noopener">${icon('link', 18)}Guest view</a>`)}
      ${suggested ? `<div class="a-banner"><span>${suggested} engine suggestions are waiting for your review.</span><a class="btn btn-s btn-primary" href="#/admin/review">Review now</a></div>` : ''}
      <div class="a-kpis">
        <div class="a-kpi lead"><div class="label">Wine attach rate</div><div class="value">${pct(k.attachRate.value)}</div><div class="delta">Up from ${pct(k.attachRate.baseline)} before Wine Match</div></div>
        <div class="a-kpi"><div class="label">Wine revenue per guest</div><div class="value">${zl(k.winePerGuest.value)}</div>${delta(k.winePerGuest.value, k.winePerGuest.prev)}</div>
        <div class="a-kpi"><div class="label">Average bottle</div><div class="value">${zl(k.avgBottle.value)}</div>${delta(k.avgBottle.value, k.avgBottle.prev)}</div>
        <div class="a-kpi"><div class="label">Average glass</div><div class="value">${zl(k.avgGlass.value)}</div>${delta(k.avgGlass.value, k.avgGlass.prev)}</div>
      </div>
      <div class="a-kpis" style="margin-top:12px">
        <div class="a-kpi"><div class="label">Wine Match sessions</div><div class="value">${k.sessions.value.toLocaleString('pl-PL')}</div>${delta(k.sessions.value, k.sessions.prev)}</div>
        <div class="a-kpi"><div class="label">Recommendations shown</div><div class="value">${k.recommendationViews.value.toLocaleString('pl-PL')}</div>${delta(k.recommendationViews.value, k.recommendationViews.prev)}</div>
        <div class="a-kpi"><div class="label">Recommendation to wine chosen</div><div class="value">${pct(k.conversion.value)}</div>${delta(k.conversion.value, k.conversion.prev)}</div>
        <div class="a-kpi"><div class="label">Wine revenue per table</div><div class="value">${zl(k.winePerTable.value)}</div>${delta(k.winePerTable.value, k.winePerTable.prev)}</div>
      </div>
      <div class="a-grid">
        <section class="panel span-8"><header><h2>Sessions and wines chosen per day</h2><small><span style="color:var(--wine)">Solid: sessions</span>, <span style="color:var(--brass)">dashed: wines chosen</span></small></header><div class="body">${lineChart()}</div></section>
        <section class="panel span-4"><header><h2>Most looked-up dishes</h2></header><div class="body"><div class="bars">
          ${TOP_DISHES.map((d) => `<div class="b"><span>${esc(dishById(d.dishId)?.name ?? d.dishId)}</span><span class="t"><i style="width:${(d.lookups / maxD) * 100}%"></i></span><b>${d.lookups}</b></div>`).join('')}
        </div></div></section>
        <section class="panel span-6"><header><h2>Most recommended wines</h2><small>Times shown</small></header><div class="body"><div class="bars">
          ${TOP_RECOMMENDED.map((d) => `<div class="b"><span>${esc(wineById(d.wineId)?.producer ?? '')}</span><span class="t"><i style="width:${(d.shown / maxR) * 100}%"></i></span><b>${d.shown}</b></div>`).join('')}
        </div></div></section>
        <section class="panel span-6"><header><h2>Most chosen wines</h2><small>Shown to a waiter</small></header><div class="body"><div class="bars">
          ${TOP_SELECTED.map((d) => `<div class="b"><span>${esc(wineById(d.wineId)?.producer ?? '')}</span><span class="t"><i class="alt" style="width:${(d.selected / maxS) * 100}%"></i></span><b>${d.selected}</b></div>`).join('')}
        </div></div></section>
        <section class="panel span-12"><header><h2>Pairing performance</h2><small>How often guests choose the wine after seeing it</small></header><div class="body flush tbl-wrap">
          <table class="tbl"><thead><tr><th>Dish</th><th>Wine</th><th>Source</th><th class="r">Shown</th><th class="r">Chosen</th><th class="r">Conversion</th></tr></thead><tbody>
          ${PAIRING_PERFORMANCE.map((p) => `<tr class="link" data-href="#/admin/pairings/${p.dishId}"><td class="name">${esc(dishById(p.dishId)?.name ?? '')}</td><td>${esc(wineById(p.wineId)?.producer ?? '')} ${esc(wineById(p.wineId)?.name ?? '')}</td>
            <td>${p.source === 'sommelier' ? '<span class="badge badge-somm">Sommelier</span>' : '<span class="badge badge-suggested">Engine</span>'}</td>
            <td class="r">${p.shown}</td><td class="r">${p.selected}</td><td class="r"><b>${pct(p.selected / p.shown)}</b></td></tr>`).join('')}
          </tbody></table></div></section>
      </div>`);
  },
  mount: (root) => {
    root.querySelectorAll<HTMLElement>('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href!)));
  }
};

/* ------------------------------------------------------------------ Menu list */
export const menuList: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Menu',
  render: (_p, q) => {
    const cat = q.get('cat') ?? 'all';
    const term = (q.get('q') ?? '').toLowerCase();
    const list = q.get('demo') === 'empty' ? [] : state.dishes.filter((d) => (cat === 'all' || d.category === cat) && (!term || `${d.name} ${d.description}`.toLowerCase().includes(term)));
    return adminShell(`${head('Menu', `${state.dishes.length} dishes. Taste profiles drive the pairing engine; confirm each draft profile before publishing.`, `<a class="btn" href="#/admin/import/menu">${icon('upload', 18)}Import menu</a>`)}
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search dishes" value="${esc(q.get('q') ?? '')}" id="menu-search" aria-label="Search dishes">
        <select class="select" id="menu-cat" aria-label="Category">${['all', 'Starters', 'Mains', 'Desserts'].map((c) => `<option value="${c}" ${c === cat ? 'selected' : ''}>${c === 'all' ? 'All categories' : c}</option>`).join('')}</select>
      </div>
      <div class="panel tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Dish</th><th>Category</th><th class="r">Price</th><th>Status</th><th>Taste profile</th><th class="r">Pairings</th></tr></thead><tbody>
        ${list.map((d) => {
          const ps = state.pairings.filter((p) => p.dishId === d.id);
          const rev = ps.filter((p) => p.status === 'approved' || p.status === 'modified').length;
          const sug = ps.filter((p) => p.status === 'suggested').length;
          return `<tr class="link" data-href="#/admin/menu/${d.id}"><td><div class="name">${esc(d.name)}</div><div class="sub">${esc(d.description)}</div></td>
            <td>${d.category}</td><td class="r">${zl(d.price)}</td><td>${statusBadge(d.status)}</td>
            <td>${d.profile.source === 'confirmed' ? '<span class="badge badge-approved">Confirmed</span>' : '<span class="badge badge-draft">Draft, needs check</span>'}</td>
            <td class="r"><b>${rev}</b> reviewed${sug ? `<div class="sub">${sug} to review</div>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : emptyBlock('No dishes found', term || cat !== 'all' ? 'Try another search or category.' : 'Import your menu to start pairing.', '<a class="btn btn-primary" href="#/admin/import/menu">Import menu</a>')}</div>`);
  },
  mount: (root, _p, q) => {
    root.querySelectorAll<HTMLElement>('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => navigate(tr.dataset.href!)));
    const go = () => {
      const params = new URLSearchParams();
      const s = root.querySelector<HTMLInputElement>('#menu-search')!.value;
      const c = root.querySelector<HTMLSelectElement>('#menu-cat')!.value;
      if (s) params.set('q', s);
      if (c !== 'all') params.set('cat', c);
      navigate(`#/admin/menu${params.toString() ? `?${params}` : ''}`);
    };
    let t: number | undefined;
    root.querySelector('#menu-search')?.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(go, 350); });
    root.querySelector('#menu-cat')?.addEventListener('change', go);
    if (q.get('q')) { const i = root.querySelector<HTMLInputElement>('#menu-search')!; i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
};

/* ------------------------------------------------------------------ Shared slider + preview helpers */
const DISH_SLIDERS: Array<[keyof DishProfile, string]> = [
  ['intensity', 'Intensity'], ['fat', 'Fat'], ['salt', 'Salt'], ['sweetness', 'Sweetness'], ['acidity', 'Acidity'],
  ['spice', 'Spice'], ['umami', 'Umami'], ['smoke', 'Smoke, char'], ['creaminess', 'Creaminess']
];
const WINE_SLIDERS: Array<[keyof WineProfile, string]> = [
  ['body', 'Body'], ['acidity', 'Acidity'], ['tannin', 'Tannin'], ['sweetness', 'Sweetness'], ['fruitiness', 'Fruit'],
  ['oak', 'Oak'], ['aromatic', 'Aromatics'], ['freshness', 'Freshness']
];

function slider(name: string, label: string, v: number): string {
  return `<label class="slider"><span>${label}</span><input type="range" min="0" max="5" step="1" name="${name}" value="${v}"><output>${v}</output></label>`;
}

function dishPreview(dish: Dish): string {
  const rows = state.wines.filter((w) => w.active).map((w) => ({ w, s: pairingScore(dish, w) })).sort((a, b) => b.s.score - a.s.score || a.w.id.localeCompare(b.w.id)).slice(0, 5);
  return rows.map(({ w, s }) => `<div class="b" style="grid-template-columns:1fr 46px"><span><b style="font-weight:600">${esc(w.producer)}</b> ${esc(w.name)}<br><small class="faint">${esc(s.why)}</small></span><b>${s.score}%</b></div>`).join('');
}

/* ------------------------------------------------------------------ Dish details */
export const dishEdit: View = {
  shell: 'admin',
  guard: requireLogin,
  title: ({ id }) => dishById(id)?.name ?? 'Dish',
  render: ({ id }) => {
    const d = dishById(id);
    if (!d) return adminShell(`${head('Dish not found', '', '', { href: '#/admin/menu', label: 'Menu' })}<div class="panel">${emptyBlock('This dish does not exist', 'It may have been removed in a recent import.', '<a class="btn" href="#/admin/menu">Back to menu</a>')}</div>`);
    const p = d.profile;
    return adminShell(`${head(d.name, d.description, `<a class="btn" href="#/admin/pairings/${d.id}">${icon('pairs', 18)}Manage pairings</a><a class="btn" href="#/r/${state.restaurant.slug}/dish/${d.id}/wines" target="_blank" rel="noopener">View as guest</a>`, { href: '#/admin/menu', label: 'Menu' })}
      <form id="dish-form" novalidate class="a-grid" style="margin-top:0">
        <section class="panel span-7"><header><h2>Details</h2>${statusBadge(d.status)}</header><div class="body form-grid">
          <label class="field full"><span>Name</span><input class="input" name="name" value="${esc(d.name)}" required></label>
          <label class="field full"><span>Description</span><textarea class="textarea" name="description">${esc(d.description)}</textarea></label>
          <label class="field"><span>Category</span><select class="select" name="category">${(['Starters', 'Mains', 'Desserts'] as DishCategory[]).map((c) => `<option ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
          <label class="field"><span>Price (zł)</span><input class="input" name="price" type="number" min="1" step="1" value="${d.price}" required></label>
          <label class="field"><span>Status</span><select class="select" name="status">${(['published', 'draft', 'hidden'] as EntityStatus[]).map((s) => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
          <label class="field"><span>Main ingredient</span><select class="select" name="protein">${['beef', 'game', 'poultry', 'pork', 'fish', 'shellfish', 'vegetable', 'mushroom', 'dairy', 'dessert'].map((x) => `<option ${x === p.protein ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="field"><span>Cooking method</span><select class="select" name="cooking">${['raw', 'cured', 'poached', 'seared', 'roasted', 'grilled', 'braised', 'fried', 'baked', 'none'].map((x) => `<option ${x === p.cooking ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <p class="error-text full" id="dish-error" role="alert" hidden></p>
        </div></section>
        <section class="panel span-5"><header><h2>Top matches with this profile</h2><small>Updates as you edit</small></header><div class="body"><div class="bars" id="preview">${dishPreview(d)}</div></div></section>
        <section class="panel span-12"><header><h2>Taste profile</h2>${p.source === 'draft' ? '<span class="badge badge-draft">Drafted from the import, please check</span>' : '<span class="badge badge-approved">Confirmed</span>'}</header>
          <div class="body"><div class="sliders">${DISH_SLIDERS.map(([k, l]) => slider(k, l, p[k] as number)).join('')}</div></div></section>
        <div class="span-12" style="display:flex;gap:10px;justify-content:flex-end">
          <a class="btn" href="#/admin/menu">Cancel</a>
          <button class="btn btn-primary" type="submit">Save and update suggestions</button>
        </div>
      </form>`);
  },
  mount: (root, { id }) => {
    const d = dishById(id);
    if (!d) return;
    const form = root.querySelector<HTMLFormElement>('#dish-form')!;
    const draft = (): Dish => {
      const fd = new FormData(form);
      const prof = { ...d.profile } as DishProfile;
      for (const [k] of DISH_SLIDERS) (prof as unknown as Record<string, number>)[k] = Number(fd.get(k));
      prof.protein = fd.get('protein') as DishProfile['protein'];
      prof.cooking = fd.get('cooking') as DishProfile['cooking'];
      return { ...d, profile: prof };
    };
    form.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'range') t.nextElementSibling!.textContent = t.value;
      root.querySelector('#preview')!.innerHTML = dishPreview(draft());
    });
    form.addEventListener('change', () => { root.querySelector('#preview')!.innerHTML = dishPreview(draft()); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const err = root.querySelector<HTMLElement>('#dish-error')!;
      const name = String(fd.get('name')).trim();
      const price = Number(fd.get('price'));
      if (!name) { err.textContent = 'Name is required.'; err.hidden = false; return; }
      if (!(price > 0)) { err.textContent = 'Price must be a positive number.'; err.hidden = false; return; }
      const next = draft();
      Object.assign(d, {
        name, description: String(fd.get('description')).trim(), price, category: fd.get('category') as DishCategory,
        status: fd.get('status') as EntityStatus, profile: { ...next.profile, source: 'confirmed' }
      });
      // Re-score reviewed pairings, regenerate unreviewed suggestions.
      for (const p of state.pairings.filter((x) => x.dishId === d.id)) {
        const w = wineById(p.wineId);
        if (w) p.modelScore = pairingScore(d, w).score;
      }
      const keep = state.pairings.filter((x) => x.dishId !== d.id || x.status !== 'suggested');
      const fresh = generateSuggestions([d], state.wines).filter((s) => !keep.some((k) => k.dishId === s.dishId && k.wineId === s.wineId));
      fresh.forEach((f) => { f.dirty = true; });
      state.pairings = [...keep, ...fresh];
      save();
      track('dish_profile_saved', { dishId: d.id });
      toast('Dish saved. Suggestions updated.');
      navigate(`#/admin/menu/${d.id}`);
    });
  }
};

/* ------------------------------------------------------------------ Wine list */
export const wineList: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Wine list',
  render: (_p, q) => {
    const style = q.get('style') ?? 'all';
    const term = (q.get('q') ?? '').toLowerCase();
    const list = q.get('demo') === 'empty' ? [] : state.wines.filter((w) => (style === 'all' || w.profile.style === style) && (!term || `${w.producer} ${w.name} ${w.region} ${w.grapes.join(' ')}`.toLowerCase().includes(term)));
    const glassCount = state.wines.filter((w) => w.active && w.glassPrice !== null).length;
    return adminShell(`${head('Wine list', `${state.wines.filter((w) => w.active).length} active wines, ${glassCount} poured by the glass.`, `<a class="btn" href="#/admin/import/wines">${icon('upload', 18)}Import wine list</a>`)}
      <div class="toolbar">
        <input class="input" type="search" placeholder="Search producer, wine, region, grape" value="${esc(q.get('q') ?? '')}" id="wine-search" aria-label="Search wines">
        <select class="select" id="wine-style" aria-label="Style"><option value="all">All styles</option>${(Object.keys(STYLE_LABEL) as WineStyle[]).map((s) => `<option value="${s}" ${s === style ? 'selected' : ''}>${STYLE_LABEL[s]}</option>`).join('')}</select>
      </div>
      <div class="panel tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>Producer and wine</th><th>Vintage</th><th>Region</th><th>Grape</th><th>Style</th><th>Serving</th><th class="r">Glass</th><th class="r">Bottle</th><th>Active</th></tr></thead><tbody>
        ${list.map((w) => `<tr class="link" data-href="#/admin/wines/${w.id}"><td><div class="name">${esc(w.producer)}</div><div class="sub">${esc(w.name)}</div></td>
          <td>${w.vintage}</td><td>${esc(w.region)}<div class="sub">${esc(w.country)}</div></td><td>${esc(w.grapes.join(', '))}</td><td>${STYLE_LABEL[w.profile.style]}</td>
          <td>${w.glassPrice !== null ? 'Glass and bottle' : 'Bottle only'}</td><td class="r">${w.glassPrice !== null ? zl(w.glassPrice) : '—'}</td><td class="r">${zl(w.bottlePrice)}</td>
          <td><label class="switch" data-stop><input type="checkbox" data-active="${w.id}" ${w.active ? 'checked' : ''} aria-label="Active"></label></td></tr>`).join('')}
        </tbody></table>` : emptyBlock('No wines found', 'Try another search, or import your wine list.', '<a class="btn btn-primary" href="#/admin/import/wines">Import wine list</a>')}</div>`);
  },
  mount: (root, _p, q, rerender) => {
    root.querySelectorAll<HTMLElement>('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-stop]')) return;
      navigate(tr.dataset.href!);
    }));
    root.querySelectorAll<HTMLInputElement>('[data-active]').forEach((cb) => cb.addEventListener('change', () => {
      const w = wineById(cb.dataset.active!);
      if (!w) return;
      w.active = cb.checked;
      save();
      track('wine_availability_changed', { wineId: w.id, active: w.active });
      toast(w.active ? `${w.producer} is back on the list.` : `${w.producer} hidden from guests.`);
      rerender();
    }));
    const go = () => {
      const params = new URLSearchParams();
      const s = root.querySelector<HTMLInputElement>('#wine-search')!.value;
      const st = root.querySelector<HTMLSelectElement>('#wine-style')!.value;
      if (s) params.set('q', s);
      if (st !== 'all') params.set('style', st);
      navigate(`#/admin/wines${params.toString() ? `?${params}` : ''}`);
    };
    let t: number | undefined;
    root.querySelector('#wine-search')?.addEventListener('input', () => { window.clearTimeout(t); t = window.setTimeout(go, 350); });
    root.querySelector('#wine-style')?.addEventListener('change', go);
    if (q.get('q')) { const i = root.querySelector<HTMLInputElement>('#wine-search')!; i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
};

/* ------------------------------------------------------------------ Wine details */
function winePreview(w: Wine): string {
  return state.dishes.filter((d) => d.status !== 'hidden').map((d) => ({ d, s: pairingScore(d, w).score })).sort((a, b) => b.s - a.s).slice(0, 5)
    .map(({ d, s }) => `<div class="b" style="grid-template-columns:1fr 46px"><span><b style="font-weight:600">${esc(d.name)}</b><br><small class="faint">${d.category}</small></span><b>${s}%</b></div>`).join('');
}

export const wineEdit: View = {
  shell: 'admin',
  guard: requireLogin,
  title: ({ id }) => wineById(id)?.name ?? 'Wine',
  render: ({ id }) => {
    const w = wineById(id);
    if (!w) return adminShell(`${head('Wine not found', '', '', { href: '#/admin/wines', label: 'Wine list' })}<div class="panel">${emptyBlock('This wine does not exist', 'It may have been removed in a recent import.', '<a class="btn" href="#/admin/wines">Back to wine list</a>')}</div>`);
    const p = w.profile;
    return adminShell(`${head(`${w.producer} ${w.name}`, `${vintage(w)}, ${esc(w.region)}, ${esc(w.country)}. ${esc(w.grapes.join(', '))}.`, '', { href: '#/admin/wines', label: 'Wine list' })}
      <form id="wine-form" novalidate class="a-grid" style="margin-top:0">
        <section class="panel span-7"><header><h2>Listing and prices</h2>${w.active ? statusBadge('published') : statusBadge('hidden')}</header><div class="body form-grid">
          <label class="field"><span>Producer</span><input class="input" name="producer" value="${esc(w.producer)}" required></label>
          <label class="field"><span>Wine</span><input class="input" name="name" value="${esc(w.name)}" required></label>
          <label class="field"><span>Glass price (zł)</span><input class="input" name="glassPrice" type="number" min="1" value="${w.glassPrice ?? ''}" placeholder="Not by the glass"></label>
          <label class="field"><span>Bottle price (zł)</span><input class="input" name="bottlePrice" type="number" min="1" value="${w.bottlePrice}" required></label>
          <label class="switch full"><input type="checkbox" name="byGlass" ${w.glassPrice !== null ? 'checked' : ''}> Poured by the glass</label>
          <label class="switch full"><input type="checkbox" name="active" ${w.active ? 'checked' : ''}> Available tonight (shown to guests)</label>
          <label class="field full"><span>Tasting note shown to guests</span><textarea class="textarea" name="tastingNote">${esc(w.tastingNote)}</textarea></label>
          <p class="error-text full" id="wine-error" role="alert" hidden></p>
        </div></section>
        <section class="panel span-5"><header><h2>Best dishes for this wine</h2><small>Updates as you edit</small></header><div class="body"><div class="bars" id="preview">${winePreview(w)}</div></div></section>
        <section class="panel span-12"><header><h2>Wine profile</h2><small>${STYLE_LABEL[p.style]}, ${p.alcohol}% abv</small></header><div class="body"><div class="sliders">${WINE_SLIDERS.map(([k, l]) => slider(k, l, p[k] as number)).join('')}</div></div></section>
        <div class="span-12" style="display:flex;gap:10px;justify-content:flex-end">
          <a class="btn" href="#/admin/wines">Cancel</a><button class="btn btn-primary" type="submit">Save wine</button>
        </div>
      </form>`);
  },
  mount: (root, { id }) => {
    const w = wineById(id);
    if (!w) return;
    const form = root.querySelector<HTMLFormElement>('#wine-form')!;
    const draft = (): Wine => {
      const fd = new FormData(form);
      const prof = { ...w.profile };
      for (const [k] of WINE_SLIDERS) (prof as unknown as Record<string, number>)[k] = Number(fd.get(k)) as Level;
      return { ...w, profile: prof };
    };
    form.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === 'range') t.nextElementSibling!.textContent = t.value;
      if (t.name === 'byGlass') form.querySelector<HTMLInputElement>('[name=glassPrice]')!.disabled = !t.checked;
      root.querySelector('#preview')!.innerHTML = winePreview(draft());
    });
    form.querySelector<HTMLInputElement>('[name=glassPrice]')!.disabled = w.glassPrice === null;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const err = root.querySelector<HTMLElement>('#wine-error')!;
      const bottle = Number(fd.get('bottlePrice'));
      const byGlass = fd.get('byGlass') === 'on';
      const glass = byGlass ? Number(fd.get('glassPrice')) : null;
      const fail = (m: string) => { err.textContent = m; err.hidden = false; };
      if (!String(fd.get('producer')).trim() || !String(fd.get('name')).trim()) return fail('Producer and wine name are required.');
      if (!(bottle > 0)) return fail('Bottle price must be a positive number.');
      if (byGlass && !(glass! > 0)) return fail('Enter a glass price, or turn off “Poured by the glass”.');
      if (byGlass && glass! >= bottle) return fail('Glass price should be lower than the bottle price.');
      Object.assign(w, {
        producer: String(fd.get('producer')).trim(), name: String(fd.get('name')).trim(), bottlePrice: bottle, glassPrice: glass,
        active: fd.get('active') === 'on', tastingNote: String(fd.get('tastingNote')).trim(), profile: draft().profile
      });
      for (const p of state.pairings.filter((x) => x.wineId === w.id)) {
        const d = dishById(p.dishId);
        if (d) { p.modelScore = pairingScore(d, w).score; p.dirty = true; }
      }
      save();
      track('wine_saved', { wineId: w.id });
      toast('Wine saved.');
      navigate('#/admin/wines');
    });
  }
};
