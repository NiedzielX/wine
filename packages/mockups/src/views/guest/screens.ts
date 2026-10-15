import type { Dish, DishCategory } from '@wine-match/core';
import { DEFAULT_PREFS } from '@wine-match/core';
import { recommendForDish, type RecommendationItem } from '@wine-match/core';
import { recommendForTable } from '@wine-match/core';
import { dishById, setPrefs, state, toggleTableDish, track, visibleDishes, wineById } from '../../state/store';
import { STYLE_LABEL, esc, icon, matchGlass, vintage, zl } from '../../ui/dom';
import { navigate, type View } from '../../ui/router';
import {
  SEAL, base, bestCard, binOf, guestShell, notFound, prefControls, prefsSummary, priceLine, readPrefClick,
  scoreBlock, skeletonList, tasteWords, topBar, validSlug, wineRow
} from './shared';

const CATS: DishCategory[] = ['Starters', 'Mains', 'Desserts'];

/** Applies the "show engine picks before review" setting. */
function visibleItems(items: RecommendationItem[]): RecommendationItem[] {
  return state.settings.showUnreviewed ? items : items.filter((i) => i.tier < 2);
}

function recsFor(dish: Dish) {
  const r = recommendForDish(dish, state.wines, state.pairings, state.guest.prefs);
  return { ...r, items: visibleItems(r.items) };
}

function bindPrefChips(root: HTMLElement, rerender: () => void, event: string, extra: Record<string, unknown> = {}): void {
  root.addEventListener('click', (e) => {
    const patch = readPrefClick(e.target as HTMLElement, state.guest.prefs);
    if (!patch) return;
    setPrefs(patch);
    track(event, { ...extra, ...patch });
    rerender();
  });
}

/* ------------------------------------------------------------------ Landing */
export const landing: View = {
  shell: 'guest',
  title: () => state.restaurant.name,
  render: ({ slug }) => {
    if (!validSlug(slug)) return notFound(slug);
    const r = state.restaurant;
    const initials = r.wineDirector.split(' ').map((x) => x[0]).join('');
    return guestShell(`
      <section class="g-hero">
        <div>
          <div class="where">${esc(r.address)}, ${esc(r.city)}</div>
          <h1>${esc(r.name)}</h1>
          <p class="lede">Find the wine for what you’re eating tonight, from our own list.</p>
          <div class="g-hero-glass">${matchGlass(78, '#B23A52', 40)}</div>
        </div>
        <div class="actions">
          <a class="btn btn-light" href="${base(slug)}/menu">Choose your dish</a>
          <a class="btn btn-ghost" href="${base(slug)}/table">Pair a bottle for the table</a>
        </div>
      </section>
      <div class="g-landing-foot">
        <div class="curator">
          <div class="avatar" aria-hidden="true">${esc(initials)}</div>
          <div><b>Wine list by ${esc(r.wineDirector)}</b><br><small>Wine Director. Every recommendation follows her pairings.</small></div>
        </div>
        <a class="g-staff-link" href="${base(slug)}/staff">For staff: quick pairing lookup</a>
      </div>`);
  },
  mount: (_root, { slug }) => { if (validSlug(slug)) track('guest_session_started', { source: 'qr' }); }
};

/* ------------------------------------------------------------------ Menu */
export const menu: View = {
  shell: 'guest',
  title: () => 'Menu',
  render: ({ slug }, q) => {
    if (!validSlug(slug)) return notFound(slug);
    const demo = q.get('demo');
    const dishes = demo === 'empty' ? [] : visibleDishes();
    let body: string;
    if (demo === 'loading') body = skeletonList(5);
    else if (demo === 'error') body = `<div class="g-empty"><h2>The menu didn’t load</h2><p>Check your connection and try again.</p><a class="btn" href="${base(slug)}/menu">Try again</a></div>`;
    else if (dishes.length === 0) body = `<div class="g-empty"><h2>Tonight’s menu is being updated</h2><p>Your waiter can suggest a wine in the meantime.</p></div>`;
    else body = CATS.map((c) => {
      const list = dishes.filter((d) => d.category === c);
      if (!list.length) return '';
      return `<section class="g-section" id="cat-${c.toLowerCase()}"><h2>${c}</h2>
        ${list.map((d) => {
          const somm = state.pairings.some((p) => p.dishId === d.id && p.role === 'primary' && (p.status === 'approved' || p.status === 'modified'));
          return `<a class="g-dish" href="${base(slug)}/dish/${d.id}">
            <span class="name">${esc(d.name)}</span><span class="price">${zl(d.price)}</span>
            <span class="desc">${esc(d.description)}</span>
            ${somm ? `<span class="hint-line">${SEAL} Sommelier pairing available</span>` : ''}
          </a>`;
        }).join('')}
      </section>`;
    }).join('');
    return guestShell(`${topBar({ back: base(slug) })}
      <main class="g-main">
        <nav class="g-mode" aria-label="Pairing mode">
          <a href="${base(slug)}/menu" aria-current="page">One dish</a>
          <a href="${base(slug)}/table">Whole table</a>
        </nav>
        <p class="muted" style="margin-bottom:6px">Pick the dish you’re ordering.</p>
        <nav class="g-cats" aria-label="Menu sections">
          ${CATS.map((c) => `<a class="chip" href="#cat-${c.toLowerCase()}" data-jump="cat-${c.toLowerCase()}">${c}</a>`).join('')}
        </nav>
        ${body}
      </main>`);
  },
  mount: (root, { slug }) => {
    if (!validSlug(slug)) return;
    track('menu_viewed');
    root.querySelectorAll<HTMLAnchorElement>('[data-jump]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.jump!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
};

/* ------------------------------------------------------------------ Dish details */
export const dishDetails: View = {
  shell: 'guest',
  title: ({ dishId }) => dishById(dishId)?.name ?? 'Dish',
  render: ({ slug, dishId }) => {
    if (!validSlug(slug)) return notFound(slug);
    const d = dishById(dishId);
    if (!d || d.status !== 'published') {
      return guestShell(`${topBar({ back: `${base(slug)}/menu` })}<main class="g-main"><div class="g-empty"><h2>This dish isn’t on tonight’s menu</h2><p>Choose another dish from the menu.</p><a class="btn" href="${base(slug)}/menu">Back to menu</a></div></main>`);
    }
    const p = state.guest.prefs;
    return guestShell(`${topBar({ back: `${base(slug)}/menu` })}
      <main class="g-main">
        <div class="g-dish-head">
          <h1>${esc(d.name)}</h1>
          <p class="desc">${esc(d.description)}</p>
          <p class="price">${zl(d.price)}</p>
          <div class="g-taste" aria-label="Taste">${tasteWords(d).map((w) => `<span>${w}</span>`).join('')}</div>
        </div>
        <div id="prefs">${prefControls(p, { full: false })}</div>
        <p class="hint" style="margin-top:14px">All optional. Skip straight to the wines if you like.</p>
      </main>
      <div class="g-bar">
        <a class="btn btn-primary btn-block" href="${base(slug)}/dish/${d.id}/wines">Show matching wines</a>
      </div>`);
  },
  mount: (root, { slug, dishId }, _q, rerender) => {
    if (!validSlug(slug) || !dishById(dishId)) return;
    state.guest.lastDish = dishId;
    track('dish_viewed', { dishId });
    bindPrefChips(root, rerender, 'quick_preference_set', { dishId });
  }
};

/* ------------------------------------------------------------------ Recommendations + filters sheet */
export const recommendations: View = {
  shell: 'guest',
  title: ({ dishId }) => `Wines for ${dishById(dishId)?.name ?? 'your dish'}`,
  render: ({ slug, dishId }, q) => {
    if (!validSlug(slug)) return notFound(slug);
    const d = dishById(dishId);
    if (!d) return guestShell(`${topBar({ back: `${base(slug)}/menu` })}<main class="g-main"><div class="g-empty"><h2>We couldn’t find that dish</h2><p>It may have come off the menu.</p><a class="btn" href="${base(slug)}/menu">Back to menu</a></div></main>`);
    const p = state.guest.prefs;
    const demo = q.get('demo');
    const res = demo === 'empty' ? { items: [], notice: null, filteredOut: 0 } : recsFor(d);
    const active = prefsSummary(p);
    const href = (wid: string) => `${base(slug)}/wine/${wid}?dish=${d.id}`;

    let content: string;
    if (demo === 'loading') {
      content = `<div class="g-best"><div class="skeleton" style="height:16px;width:40%"></div><div class="skeleton" style="height:28px;width:80%;margin-top:14px"></div><div class="skeleton" style="height:14px;width:60%;margin-top:10px"></div><div class="skeleton" style="height:48px;margin-top:16px"></div></div>${skeletonList(2)}`;
    } else if (demo === 'error') {
      content = `<div class="g-empty"><h2>Recommendations didn’t load</h2><p>Your waiter can help you choose, or try again.</p><a class="btn" href="${base(slug)}/dish/${d.id}/wines">Try again</a></div>`;
    } else if (res.items.length === 0) {
      content = `<div class="g-empty">
        <h2>No wine fits all your choices</h2>
        <p>${active.length ? 'Try fewer filters, or a different budget.' : 'Our sommelier is still preparing pairings for this dish. Your waiter can help.'}</p>
        ${active.length ? `<button class="btn" data-action="clear">Clear filters</button>` : ''}
      </div>`;
    } else {
      const [first, ...rest] = res.items;
      content = `${res.notice ? `<div class="g-notice">${icon('info', 18)}<span>${esc(res.notice)}</span></div>` : ''}
        ${bestCard(first, href(first.wine.id), p, 'Perfect with your dish')}
        ${rest.length ? `<section class="g-alts"><h2>Also good with this dish</h2>${rest.map((i) => wineRow(i, href(i.wine.id), p)).join('')}</section>` : ''}
        <p class="g-trust">${SEAL}<span>Pairings are chosen from Halka’s list and reviewed by ${esc(state.restaurant.wineDirector)}, our Wine Director.</span></p>`;
    }

    const sheet = q.get('sheet') === 'filters' ? `
      <div class="g-scrim" data-action="close-sheet"></div>
      <section class="g-sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="grab"></div>
        <header><h2 id="sheet-title">Refine</h2><a class="g-iconbtn" href="${base(slug)}/dish/${d.id}/wines" aria-label="Close">${icon('close')}</a></header>
        ${prefControls(p, { full: true })}
        <footer>
          <button class="btn" data-action="clear">Reset</button>
          <a class="btn btn-primary" href="${base(slug)}/dish/${d.id}/wines" data-autofocus>Show ${res.items.length} ${res.items.length === 1 ? 'wine' : 'wines'}</a>
        </footer>
      </section>` : '';

    return guestShell(`${topBar({
      back: `${base(slug)}/dish/${d.id}`,
      right: `<a class="g-iconbtn" href="${base(slug)}/dish/${d.id}/wines?sheet=filters" aria-label="Refine">${icon('filter', 22)}</a>`
    })}
      <main class="g-main">
        <div class="g-rec-head">
          <div><h1>For your ${esc(d.name.toLowerCase())}</h1><p>${res.items.length} ${res.items.length === 1 ? 'wine' : 'wines'} from our list</p></div>
        </div>
        <div class="g-active-filters">
          ${active.map((a) => `<span class="chip" aria-pressed="true">${esc(a)}</span>`).join('')}
          <a class="chip" href="${base(slug)}/dish/${d.id}/wines?sheet=filters">${icon('filter', 15)} ${active.length ? 'Edit' : 'Refine'}</a>
        </div>
        ${content}
      </main>${sheet}`);
  },
  mount: (root, { slug, dishId }, q, rerender) => {
    const d = dishById(dishId);
    if (!validSlug(slug) || !d) return;
    if (q.get('sheet') !== 'filters') {
      const r = recsFor(d);
      track('recommendations_viewed', { dishId, wineIds: r.items.map((i) => i.wine.id), prefs: state.guest.prefs });
    } else track('filters_opened', { dishId });
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'clear') { setPrefs({ ...DEFAULT_PREFS }); track('filters_cleared', { dishId }); rerender(); return; }
      if (action === 'close-sheet') { navigate(`${base(slug)}/dish/${dishId}/wines`); return; }
      const w = t.closest<HTMLElement>('[data-wine]');
      if (w) track('recommendation_clicked', { dishId, wineId: w.dataset.wine });
    });
    bindPrefChips(root, rerender, 'filter_changed', { dishId });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && q.get('sheet')) navigate(`${base(slug)}/dish/${dishId}/wines`); };
    window.addEventListener('keydown', onKey, { once: true });
  }
};

/* ------------------------------------------------------------------ Wine details */
export const wineDetails: View = {
  shell: 'guest',
  title: ({ wineId }) => wineById(wineId)?.name ?? 'Wine',
  render: ({ slug, wineId }, q) => {
    if (!validSlug(slug)) return notFound(slug);
    const w = wineById(wineId);
    const fromTable = q.get('table') === '1';
    const dish = q.get('dish') ? dishById(q.get('dish')!) : undefined;
    const back = fromTable ? `${base(slug)}/table/result` : dish ? `${base(slug)}/dish/${dish.id}/wines` : `${base(slug)}/menu`;
    if (!w || !w.active) return guestShell(`${topBar({ back })}<main class="g-main"><div class="g-empty"><h2>This wine is no longer available</h2><p>It may have sold out tonight. Your other matches are still waiting.</p><a class="btn" href="${back}">See other wines</a></div></main>`);

    let match: RecommendationItem | undefined;
    if (dish) match = recommendForDish(dish, state.wines, state.pairings, { ...DEFAULT_PREFS }, 50).items.find((i) => i.wine.id === w.id);
    const p = state.guest.prefs;
    const glassOk = w.glassPrice !== null;
    const defaultServing = p.serving === 'bottle' || !glassOk || fromTable ? 'bottle' : 'glass';
    const prof = w.profile;
    const dots = (n: number) => `<span class="dots" aria-label="${n} of 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;

    return guestShell(`${topBar({ back })}
      <main class="g-main">
        <div class="g-wine-hero">
          <div>
            <h1>${esc(w.name)}</h1>
            <p class="producer">${esc(w.producer)}</p>
          </div>
          ${match ? scoreBlock(match.matchScore, w.colour, 52) : matchGlass(70, w.colour, 52)}
        </div>
        ${match ? `<div class="g-somm" style="${match.sommelier ? '' : 'background:var(--paper)'}">
          <div class="who" style="${match.sommelier ? '' : 'color:var(--ink-2)'}">${match.sommelier ? `${SEAL} ${esc(state.restaurant.wineDirector)}, Wine Director` : `Why it works with the ${esc(dish!.name.toLowerCase())}`}</div>
          <p>${esc(match.why)}</p>
        </div>` : ''}
        <dl class="g-facts">
          <div><dt>Region</dt><dd>${esc(w.region)}, ${esc(w.country)}</dd></div>
          <div><dt>Vintage</dt><dd>${vintage(w)}</dd></div>
          <div><dt>Grapes</dt><dd>${esc(w.grapes.join(', '))}</dd></div>
          <div><dt>Style</dt><dd>${STYLE_LABEL[prof.style]}, ${prof.alcohol}% abv</dd></div>
        </dl>
        <p class="g-note">${esc(w.tastingNote)}</p>
        <div class="g-profile">
          <div><span>Body</span>${dots(prof.body)}</div>
          <div><span>Acidity</span>${dots(prof.acidity)}</div>
          <div><span>Tannin</span>${dots(prof.tannin)}</div>
          <div><span>Sweetness</span>${dots(prof.sweetness)}</div>
        </div>
        <fieldset class="g-serve" style="border:0;padding:0">
          <legend class="sr-only">How would you like it?</legend>
          <label aria-disabled="${!glassOk}"><input type="radio" name="serving" value="glass" ${defaultServing === 'glass' ? 'checked' : ''} ${glassOk ? '' : 'disabled'}>
            <span>Glass, ${w.glassPour} ml</span><b>${glassOk ? zl(w.glassPrice!) : 'Bottle only'}</b>${glassOk ? '' : '<small>Not poured by the glass</small>'}</label>
          <label><input type="radio" name="serving" value="bottle" ${defaultServing === 'bottle' ? 'checked' : ''}>
            <span>Bottle, ${w.bottleSize} ml</span><b>${zl(w.bottlePrice)}</b></label>
        </fieldset>
      </main>
      <div class="g-bar"><button class="btn btn-primary btn-block" data-action="choose">Choose this wine</button></div>`);
  },
  mount: (root, { slug, wineId }, q) => {
    const w = wineById(wineId);
    if (!validSlug(slug) || !w) return;
    track('wine_viewed', { wineId, dishId: q.get('dish'), context: q.get('table') ? 'table' : 'dish' });
    root.querySelector('[data-action="choose"]')?.addEventListener('click', () => {
      const serving = root.querySelector<HTMLInputElement>('input[name="serving"]:checked')?.value ?? 'bottle';
      const params = new URLSearchParams({ serving });
      if (q.get('dish')) params.set('dish', q.get('dish')!);
      if (q.get('table')) params.set('table', '1');
      track('wine_selected', { wineId, serving, dishId: q.get('dish'), context: q.get('table') ? 'table' : 'dish' });
      navigate(`${base(slug)}/selected/${wineId}?${params}`);
    });
  }
};

/* ------------------------------------------------------------------ Confirmation */
export const confirmation: View = {
  shell: 'guest',
  title: () => 'Your wine',
  render: ({ slug, wineId }, q) => {
    if (!validSlug(slug)) return notFound(slug);
    const w = wineById(wineId);
    if (!w) return guestShell(`${topBar({ back: `${base(slug)}/menu` })}<main class="g-main"><div class="g-empty"><h2>We couldn’t find that wine</h2><a class="btn" href="${base(slug)}/menu">Back to menu</a></div></main>`);
    const serving = q.get('serving') === 'glass' && w.glassPrice !== null ? 'glass' : 'bottle';
    const dish = q.get('dish') ? dishById(q.get('dish')!) : undefined;
    const price = serving === 'glass' ? w.glassPrice! : w.bottlePrice;
    const back = `${base(slug)}/wine/${w.id}?${q.get('table') ? 'table=1' : dish ? `dish=${dish.id}` : ''}`;
    return guestShell(`${topBar({ back })}
      <main class="g-main">
        <div class="g-confirm">
          ${matchGlass(100, w.colour, 54)}
          <p class="lead">Show this to your waiter.</p>
          <div class="for-waiter">
            <span class="bin">List no. ${binOf(w)}</span>
            <h2>${esc(w.producer)}<br>${esc(w.name)}</h2>
            <span class="muted">${vintage(w)}</span>
            <span class="serve">${serving === 'glass' ? `1 glass, ${w.glassPour} ml` : `1 bottle, ${w.bottleSize} ml`}, ${zl(price)}</span>
            ${dish ? `<span class="faint">With the ${esc(dish.name.toLowerCase())}</span>` : q.get('table') ? '<span class="faint">For the table</span>' : ''}
          </div>
          <a class="btn btn-block" href="${base(slug)}/menu">Pair another dish</a>
          <a class="btn btn-quiet" href="${base(slug)}">Done</a>
        </div>
      </main>`);
  },
  mount: (_r, { wineId }, q) => track('selection_shown_to_waiter', { wineId, serving: q.get('serving') })
};

/* ------------------------------------------------------------------ Whole table selection */
export const tableSelect: View = {
  shell: 'guest',
  title: () => 'Pair for the table',
  render: ({ slug }) => {
    if (!validSlug(slug)) return notFound(slug);
    const sel = state.guest.table.filter((id) => dishById(id)?.status === 'published');
    const dishes = visibleDishes();
    const n = sel.length;
    return guestShell(`${topBar({ back: base(slug) })}
      <main class="g-main">
        <nav class="g-mode" aria-label="Pairing mode">
          <a href="${base(slug)}/menu">One dish</a>
          <a href="${base(slug)}/table" aria-current="page">Whole table</a>
        </nav>
        <p class="muted">Tick everything your table is ordering. We’ll find one bottle that works across all of it.</p>
        ${CATS.map((c) => {
          const list = dishes.filter((d) => d.category === c);
          return `<section class="g-section"><h2>${c}</h2>${list.map((d) => `
            <label class="g-pick"><input type="checkbox" data-dish="${d.id}" ${sel.includes(d.id) ? 'checked' : ''}>
              <span><span class="name">${esc(d.name)}</span><br><span class="desc">${esc(d.description)}</span></span>
              <span class="faint num">${zl(d.price)}</span></label>`).join('')}</section>`;
        }).join('')}
        <details style="margin-top:24px"><summary style="cursor:pointer;font-weight:600">Colour and budget</summary>
          <div id="prefs">${prefControls(state.guest.prefs, { full: false, table: true })}</div>
        </details>
      </main>
      <div class="g-bar">
        <span class="count" aria-live="polite">${n === 0 ? 'No dishes selected' : n === 1 ? '1 dish selected, add one more' : `${n} dishes selected`}</span>
        <a class="btn btn-primary btn-block" href="${base(slug)}/table/result" aria-disabled="${n < 2}" ${n < 2 ? 'tabindex="-1"' : ''}>Find a bottle for the table</a>
        ${n ? '<button class="btn btn-quiet" data-action="clear-table">Clear selection</button>' : ''}
      </div>`);
  },
  mount: (root, { slug }, _q, rerender) => {
    if (!validSlug(slug)) return;
    root.querySelectorAll<HTMLInputElement>('[data-dish]').forEach((cb) => cb.addEventListener('change', () => {
      toggleTableDish(cb.dataset.dish!);
      const y = window.scrollY;
      rerender();
      window.scrollTo(0, y);
    }));
    root.querySelector('[data-action="clear-table"]')?.addEventListener('click', () => { state.guest.table = []; rerender(); });
    bindPrefChips(root, () => { const y = window.scrollY; rerender(); window.scrollTo(0, y); root.ownerDocument.querySelector('details')?.setAttribute('open', ''); }, 'table_preference_set');
  }
};

/* ------------------------------------------------------------------ Best wine for the table */
export const tableResult: View = {
  shell: 'guest',
  title: () => 'Best wine for your table',
  render: ({ slug }) => {
    if (!validSlug(slug)) return notFound(slug);
    const dishes = state.guest.table.map((id) => dishById(id)).filter((d): d is Dish => !!d && d.status === 'published');
    if (dishes.length < 2) {
      return guestShell(`${topBar({ back: `${base(slug)}/table` })}<main class="g-main"><div class="g-empty"><h2>Add at least two dishes</h2><p>A table pairing needs two or more dishes. For a single dish, use the menu.</p><a class="btn btn-primary" href="${base(slug)}/table">Choose dishes</a></div></main>`);
    }
    const p = state.guest.prefs;
    const res = recommendForTable(dishes, state.wines, state.pairings, p);
    const tPrefs = { ...p, serving: 'bottle' as const };
    const item = (i: (typeof res.items)[number], featured: boolean) => `
      <a class="${featured ? 'g-table-best' : 'g-wine'}" href="${base(slug)}/wine/${i.wine.id}?table=1" style="display:block;text-decoration:none;color:inherit">
        ${featured ? `<div class="g-best" style="padding:0;border:0"><div class="kicker">${icon('table', 16)} Recommended for your table</div></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr auto;gap:14px;margin-top:${featured ? 12 : 0}px">
          <div><div class="wine-name serif" style="font-size:${featured ? 25 : 19}px;line-height:1.15">${esc(i.wine.name)}</div>
          <div class="producer muted" style="font-size:14.5px">${esc(i.wine.producer)}, ${esc(i.wine.region)}</div>
          <p class="why muted" style="font-size:14px;margin-top:6px">${esc(i.why)}</p></div>
          ${scoreBlock(i.overall, i.wine.colour, featured ? 48 : 36)}
        </div>
        ${featured ? `<div class="g-perdish">${i.perDish.map((x) => `
          <div class="r"><span>${esc(x.dish.name)}${x.sommelierPick ? ` <span title="Sommelier pairing" style="color:var(--brass);display:inline-block;vertical-align:-3px">${SEAL}</span>` : ''}</span>
          <span class="track"><i style="width:${x.score}%"></i></span><b>${x.score}%</b></div>`).join('')}
          <div class="g-overall"><span>Overall match</span><b>${i.overall}%</b></div>
        </div>` : ''}
        <div style="margin-top:12px">${priceLine(i.wine, tPrefs)}</div>
      </a>`;
    const [best, ...alts] = res.items;
    return guestShell(`${topBar({ back: `${base(slug)}/table` })}
      <main class="g-main">
        <div class="g-rec-head"><div><h1>Best wine for your table</h1><p>${dishes.length} dishes: ${esc(dishes.map((d) => d.name).join(', '))}</p></div></div>
        ${res.setAside.length ? `<div class="g-notice">${icon('info', 18)}<span>Desserts are paired separately. Tap ${esc(res.setAside.map((d) => d.name).join(' or '))} in the menu after your mains.</span></div>` : ''}
        ${best ? item(best, true) : `<div class="g-empty"><h2>No bottle fits these filters</h2><p>Try another colour or budget.</p><a class="btn" href="${base(slug)}/table">Change preferences</a></div>`}
        ${alts.length ? `<section class="g-alts"><h2>Other bottles that work</h2>${alts.map((a) => item(a, false)).join('')}</section>` : ''}
        ${res.splitSuggested && res.split.length ? `<section class="g-split"><h2>Or by the glass, dish by dish</h2>
          <p class="muted" style="font-size:14px;margin:4px 0 6px">These dishes pull in different directions, so a glass each may suit you better.</p>
          ${res.split.map((s) => `<a class="s" href="${base(slug)}/wine/${s.wine.id}?dish=${s.dish.id}"><span><b>${esc(s.dish.name)}</b><br><span class="muted">${esc(s.wine.producer)} ${esc(s.wine.name)}</span></span><span class="num">${zl(s.wine.glassPrice ?? s.wine.bottlePrice)}</span></a>`).join('')}
        </section>` : ''}
      </main>`);
  },
  mount: (_root, { slug }) => {
    if (!validSlug(slug)) return;
    track('table_recommendation_viewed', { dishIds: state.guest.table });
  }
};

/* ------------------------------------------------------------------ Waiter quick lookup */
export const staff: View = {
  shell: 'guest',
  title: () => 'Staff lookup',
  render: ({ slug }, q) => {
    if (!validSlug(slug)) return notFound(slug);
    const dishes = visibleDishes();
    const dish = dishById(q.get('dish') ?? '') ?? dishes[0];
    const p = state.guest.prefs;
    const r = recommendForDish(dish, state.wines, state.pairings, p);
    return guestShell(`${topBar({ back: base(slug), title: 'Pairing lookup' })}
      <main class="g-main">
        <p class="muted" style="margin-bottom:12px">For the floor team. Same pairings the guest sees, ordered by the Wine Director’s picks.</p>
        <label class="field"><span>Dish</span>
          <select class="select" id="staff-dish">${dishes.map((d) => `<option value="${d.id}" ${d.id === dish.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
        </label>
        ${prefControls(p, { full: false })}
        <div style="margin-top:22px">
        ${r.items.length ? r.items.map((i, k) => `<div class="g-staff-card">
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
            <b class="serif" style="font-size:18px;font-weight:500">${k + 1}. ${esc(i.wine.producer)} ${esc(i.wine.name)}</b>
            <span class="num faint">no. ${binOf(i.wine)}</span></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${i.sommelier ? `<span class="badge badge-somm">${SEAL} ${i.sommelier.role === 'primary' ? 'Wine Director’s first choice' : 'Wine Director’s pick'}</span>` : ''}${i.bestValue ? '<span class="badge badge-value">Best value</span>' : ''}<span class="badge badge-neutral">${i.matchScore}% match</span></div>
          <p class="talk">Say: “${esc(i.why)}”</p>
          ${priceLine(i.wine, p)}
        </div>`).join('') : '<div class="g-empty"><h2>Nothing fits</h2><p>Relax the budget or colour.</p></div>'}
        </div>
      </main>`);
  },
  mount: (root, { slug }, q, rerender) => {
    if (!validSlug(slug)) return;
    track('staff_lookup', { dishId: q.get('dish') });
    root.querySelector<HTMLSelectElement>('#staff-dish')?.addEventListener('change', (e) => navigate(`${base(slug)}/staff?dish=${(e.target as HTMLSelectElement).value}`));
    bindPrefChips(root, rerender, 'staff_filter_changed');
  }
};
