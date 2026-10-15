import type { Dish, GuestPreferences, Wine, WineStyle } from '@wine-match/core';
import type { RecommendationItem } from '@wine-match/core';
import { state } from '../../state/store';
import { STYLE_LABEL, esc, icon, matchGlass, zl } from '../../ui/dom';

export const base = (slug: string) => `#/r/${slug}`;

export function validSlug(slug: string): boolean {
  return slug === state.restaurant.slug;
}

export function binOf(w: Wine): number {
  return 101 + state.wines.findIndex((x) => x.id === w.id);
}

export function guestShell(inner: string): string {
  return `<div class="g-app">${inner}</div>`;
}

export function topBar(opts: { back?: string; title?: string; right?: string }): string {
  return `<header class="g-top">
    ${opts.back ? `<a class="g-iconbtn" href="${opts.back}" aria-label="Back">${icon('back', 22)}</a>` : '<span></span>'}
    <div class="title">${esc(opts.title ?? state.restaurant.name)}</div>
    ${opts.right ?? '<span></span>'}
  </header>`;
}

export const SEAL = `<svg class="seal" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.2 8.2 7.2 10l3.6-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function roleLabel(item: RecommendationItem): string {
  if (!item.sommelier) return '';
  return `<span class="badge badge-somm">${SEAL} Sommelier recommendation</span>`;
}

export function priceLine(w: Wine, prefs: GuestPreferences): string {
  const parts: string[] = [];
  if (w.glassPrice !== null && prefs.serving !== 'bottle') parts.push(`<span>${icon('glass', 16)}<span class="sr-only">Glass</span>${zl(w.glassPrice)}</span>`);
  if (prefs.serving !== 'glass') parts.push(`<span>${icon('bottle', 16)}<span class="sr-only">Bottle</span>${zl(w.bottlePrice)}</span>`);
  return `<div class="g-price">${parts.join('')}</div>`;
}

export function scoreBlock(score: number, colour: string, size = 40): string {
  const show = state.settings.showScores;
  return `<div class="g-score">${matchGlass(score, colour, size)}${show ? `<b>${score}%</b><small>match</small>` : ''}</div>`;
}

export function wineRow(item: RecommendationItem, href: string, prefs: GuestPreferences): string {
  const w = item.wine;
  const badges = [roleLabel(item), item.bestValue ? '<span class="badge badge-value">Best value</span>' : ''].filter(Boolean).join('');
  return `<a class="g-wine" href="${href}" data-wine="${w.id}">
    <div>
      <div class="wine-name">${esc(w.name)}</div>
      <div class="producer">${esc(w.producer)}, ${esc(w.region)} ${w.vintage === 'NV' ? '' : w.vintage}</div>
      <p class="why">${esc(item.why)}</p>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      <div style="margin-top:10px">${priceLine(w, prefs)}</div>
    </div>
    ${scoreBlock(item.matchScore, w.colour, 36)}
  </a>`;
}

export function bestCard(item: RecommendationItem, href: string, prefs: GuestPreferences, kicker = 'Best match'): string {
  const w = item.wine;
  return `<a class="g-best" href="${href}" data-wine="${w.id}">
    <div class="kicker">${item.sommelier ? SEAL : icon('star', 16)} ${item.sommelier ? 'Sommelier recommendation' : esc(kicker)}</div>
    <div class="row">
      <div>
        <div class="wine-name">${esc(w.name)}</div>
        <div class="producer">${esc(w.producer)}<br>${esc(w.region)}, ${w.vintage === 'NV' ? 'non-vintage' : w.vintage}</div>
      </div>
      ${scoreBlock(item.matchScore, w.colour, 48)}
    </div>
    <p class="why">${esc(item.why)}</p>
    <div class="meta">${priceLine(w, prefs)}${item.bestValue ? '<span class="badge badge-value">Best value</span>' : ''}</div>
  </a>`;
}

export function tasteWords(d: Dish): string[] {
  const p = d.profile;
  const words: string[] = [];
  if (p.intensity >= 4) words.push('Full-flavoured'); else if (p.intensity <= 2) words.push('Delicate');
  if (p.umami >= 4) words.push('Savoury');
  if (p.smoke >= 3) words.push('Smoky, charred');
  if (p.creaminess >= 3) words.push('Creamy');
  if (p.spice >= 2) words.push('Gently spicy');
  if (p.sweetness >= 3) words.push('Sweet');
  if (p.acidity >= 3) words.push('Bright, tangy');
  if (p.salt >= 4) words.push('Salty');
  if (p.fat >= 4 && p.protein !== 'dessert') words.push('Rich');
  if (p.sweetness === 2 && p.protein !== 'dessert') words.push('Sweet and sour notes');
  return words.slice(0, 4);
}

export function prefsSummary(p: GuestPreferences): string[] {
  const s: string[] = [];
  if (p.serving === 'glass') s.push('By the glass');
  if (p.serving === 'bottle') s.push('By the bottle');
  if (p.styles.length) s.push(p.styles.map((x) => STYLE_LABEL[x]).join(', '));
  if (p.maxPrice !== null) s.push(`Up to ${zl(p.maxPrice)}`);
  if (p.weight !== 'any') s.push(p.weight === 'lighter' ? 'Lighter' : 'Fuller');
  if (p.mood !== 'any') s.push(p.mood === 'classic' ? 'Classic' : 'Adventurous');
  return s;
}

const STYLES: WineStyle[] = ['sparkling', 'white', 'rose', 'orange', 'red', 'sweet'];

export function budgetOptions(serving: GuestPreferences['serving']): number[] {
  return serving === 'glass' ? [45, 60, 75] : [200, 300, 400];
}

/** Quick preference controls, reused on the dish page, filters sheet and table page. */
export function prefControls(p: GuestPreferences, opts: { full: boolean; table?: boolean }): string {
  const seg = (name: string, value: string, label: string, current: string) =>
    `<button type="button" class="chip" data-pref="${name}" data-value="${value}" aria-pressed="${current === value}">${label}</button>`;
  const budgets = budgetOptions(opts.table ? 'bottle' : p.serving);
  const servingRow = opts.table
    ? ''
    : `<div class="g-q"><h2>Glass or bottle</h2><div class="chips">
        ${seg('serving', 'any', 'Either', p.serving)}${seg('serving', 'glass', 'By the glass', p.serving)}${seg('serving', 'bottle', 'By the bottle', p.serving)}
      </div></div>`;
  return `${servingRow}
    <div class="g-q"><h2>Colour or style</h2><div class="chips">
      ${STYLES.map((s) => `<button type="button" class="chip" data-style="${s}" aria-pressed="${p.styles.includes(s)}">${STYLE_LABEL[s]}</button>`).join('')}
    </div></div>
    <div class="g-q"><h2>Budget${opts.table ? ' per bottle' : p.serving === 'glass' ? ' per glass' : ''}</h2><div class="chips">
      <button type="button" class="chip" data-budget="" aria-pressed="${p.maxPrice === null}">Any</button>
      ${budgets.map((b) => `<button type="button" class="chip" data-budget="${b}" aria-pressed="${p.maxPrice === b}">Up to ${zl(b)}</button>`).join('')}
    </div></div>
    ${opts.full ? `
    <div class="g-q"><h2>Body</h2><div class="chips">
      ${seg('weight', 'any', 'No preference', p.weight)}${seg('weight', 'lighter', 'Lighter', p.weight)}${seg('weight', 'fuller', 'Fuller', p.weight)}
    </div></div>
    <div class="g-q"><h2>Mood</h2><div class="chips">
      ${seg('mood', 'any', 'No preference', p.mood)}${seg('mood', 'classic', 'Classic', p.mood)}${seg('mood', 'adventurous', 'Adventurous', p.mood)}
    </div></div>` : ''}`;
}

/** Applies chip clicks to a preferences object; returns the patch or null. */
export function readPrefClick(target: HTMLElement, p: GuestPreferences): Partial<GuestPreferences> | null {
  const btn = target.closest<HTMLElement>('[data-pref],[data-style],[data-budget]');
  if (!btn) return null;
  if (btn.dataset.pref) {
    const key = btn.dataset.pref as 'serving' | 'weight' | 'mood';
    const patch: Partial<GuestPreferences> = { [key]: btn.dataset.value } as Partial<GuestPreferences>;
    if (key === 'serving') patch.maxPrice = null; // budget scale differs for glass and bottle
    return patch;
  }
  if (btn.dataset.style) {
    const s = btn.dataset.style as WineStyle;
    return { styles: p.styles.includes(s) ? p.styles.filter((x) => x !== s) : [...p.styles, s] };
  }
  if (btn.dataset.budget !== undefined) {
    return { maxPrice: btn.dataset.budget === '' ? null : Number(btn.dataset.budget) };
  }
  return null;
}

export function notFound(slug: string): string {
  return guestShell(`${topBar({ title: 'Wine Match' })}
    <main class="g-main"><div class="g-empty">
      <h2>This menu isn’t available</h2>
      <p>The link “${esc(slug)}” doesn’t match a restaurant. Scan the QR code on your table again or ask your waiter.</p>
      <a class="btn" href="#/r/halka">Open Halka’s menu</a>
    </div></main>`);
}

export function skeletonList(n = 3): string {
  return Array.from({ length: n }, () => `<div style="padding:16px 0;border-bottom:1px solid var(--line);display:grid;gap:8px">
    <div class="skeleton" style="height:20px;width:70%"></div><div class="skeleton" style="height:14px;width:45%"></div><div class="skeleton" style="height:14px;width:85%"></div></div>`).join('');
}
