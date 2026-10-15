import type { Wine, WineStyle } from '@wine-match/core';

/** Escapes text for safe interpolation into template strings. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function zl(n: number): string {
  return `${n.toLocaleString('pl-PL')} zł`;
}

export function wineTitle(w: Wine): string {
  return `${w.producer} ${w.name}`;
}

export function vintage(w: Wine): string {
  return w.vintage === 'NV' ? 'Non-vintage' : String(w.vintage);
}

export const STYLE_LABEL: Record<WineStyle, string> = {
  sparkling: 'Sparkling', white: 'White', rose: 'Rosé', orange: 'Orange', red: 'Red', sweet: 'Sweet'
};

export function fmtDate(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

let toastTimer: number | undefined;
export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

/** Inline icon set (stroke icons, 20px grid). Kept local, no icon font. */
const PATHS: Record<string, string> = {
  back: 'M12.5 4.5 7 10l5.5 5.5',
  chevron: 'M8 4.5 13.5 10 8 15.5',
  close: 'M5 5l10 10M15 5 5 15',
  filter: 'M3 5h14M6 10h8M8.5 15h3',
  check: 'M4.5 10.5 8 14l7.5-8',
  plus: 'M10 4v12M4 10h12',
  table: 'M3 8h14M5 8v8M15 8v8M7 4h6',
  glass: 'M6 3h8c0 5-1.6 8-4 8s-4-3-4-8zM10 11v5M7 17h6',
  bottle: 'M8.5 2.5h3v3c1.8 1 2.5 2.4 2.5 4.5v7.5h-8V10c0-2.1.7-3.5 2.5-4.5z',
  dash: 'M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z',
  menu: 'M4 5h12M4 10h12M4 15h8',
  wine: 'M7 2.5h6l-.5 4.5a2.5 2.5 0 0 1-5 0zM10 9.5v8M7.5 17.5h5',
  link: 'M8 12l4-4M7 9.5 5.5 11a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 10.5 14.5 9A2.5 2.5 0 0 0 11 5.5L9.5 7',
  upload: 'M10 13V3.5M6 7l4-4 4 4M4 13v3.5h12V13',
  qr: 'M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h2v2h-2zM15 15h2v2h-2zM12 16h1M16 12h1',
  publish: 'M10 14V4M6 8l4-4 4 4M4 16h12',
  logout: 'M8 4H4v12h4M12 6.5 15.5 10 12 13.5M15.5 10H8',
  up: 'M10 15V5M6 9l4-4 4 4',
  down: 'M10 5v10M6 11l4 4 4-4',
  trash: 'M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6',
  star: 'M10 3.5 12 8l4.7.4-3.6 3 1.1 4.6L10 13.6 5.8 16l1.1-4.6-3.6-3L8 8z',
  info: 'M10 9v5M10 6.2v.1M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  pairs: 'M5 4v12M15 4v12M5 10h10',
  reset: 'M4.5 10a5.5 5.5 0 1 0 1.6-3.9M4.5 3.5v3h3'
};

export function icon(name: keyof typeof PATHS | string, size = 20): string {
  const d = PATHS[name] ?? PATHS.info;
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/**
 * Match glass — the signature element. A wine glass filled to the match level
 * in the wine's own colour. Score 0–100.
 */
export function matchGlass(score: number, colour: string, size = 44): string {
  const top = 6;
  const bottom = 30;
  const fillY = bottom - ((bottom - top) * Math.max(0, Math.min(100, score))) / 100;
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="match-glass" width="${size}" height="${Math.round(size * 1.3)}" viewBox="0 0 40 52" role="img" aria-label="Match ${score} percent">
    <defs><clipPath id="${id}"><path d="M8 6h24c0 15-5 24-12 24S8 21 8 6z"/></clipPath></defs>
    <rect x="0" y="${fillY.toFixed(1)}" width="40" height="40" fill="${colour}" clip-path="url(#${id})"/>
    <path d="M8 6h24c0 15-5 24-12 24S8 21 8 6z" fill="none" stroke="currentColor" stroke-width="1.3"/>
    <path d="M20 30v14M13 46h14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
}

export function qs<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(sel);
}
