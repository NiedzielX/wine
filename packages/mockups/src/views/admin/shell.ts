import { dirtyCount, state } from '../../state/store';
import { esc, icon } from '../../ui/dom';
import { currentPath } from '../../ui/router';

export function requireLogin(): string | null {
  if (state.session.staffName) return null;
  const { path } = currentPath();
  return `#/admin/login?next=${encodeURIComponent(path)}`;
}

const NAV: Array<{ group?: string; href: string; label: string; ico: string; match: RegExp; count?: () => number }> = [
  { href: '#/admin', label: 'Dashboard', ico: 'dash', match: /^\/admin$/ },
  { group: 'Wine program', href: '#/admin/menu', label: 'Menu', ico: 'menu', match: /^\/admin\/menu/ },
  { href: '#/admin/wines', label: 'Wine list', ico: 'wine', match: /^\/admin\/wines/ },
  { href: '#/admin/pairings', label: 'Pairings', ico: 'pairs', match: /^\/admin\/pairings/ },
  { href: '#/admin/review', label: 'Review queue', ico: 'check', match: /^\/admin\/review/, count: () => state.pairings.filter((p) => p.status === 'suggested').length },
  { group: 'Data', href: '#/admin/import/menu', label: 'Import menu', ico: 'upload', match: /^\/admin\/import\/menu/ },
  { href: '#/admin/import/wines', label: 'Import wine list', ico: 'upload', match: /^\/admin\/import\/wines/ },
  { group: 'Go live', href: '#/admin/setup', label: 'Setup checklist', ico: 'info', match: /^\/admin\/setup/ },
  { href: '#/admin/publish', label: 'Publish', ico: 'publish', match: /^\/admin\/publish/, count: dirtyCount },
  { href: '#/admin/qr', label: 'QR code', ico: 'qr', match: /^\/admin\/qr/ }
];

export function adminShell(inner: string): string {
  const { path } = currentPath();
  const r = state.restaurant;
  const name = state.session.staffName ?? '';
  const initials = name.split(' ').map((x) => x[0]).join('');
  return `<div class="a-app">
    <aside class="a-side">
      <a class="a-brand" href="#/admin"><span class="mark">${icon('glass', 18)}</span><b>Wine Match</b></a>
      <div class="a-venue"><b>${esc(r.name)}</b><small>${esc(r.address)}, ${esc(r.city)}</small></div>
      <nav class="a-nav" aria-label="Dashboard">
        ${NAV.map((n) => {
          const c = n.count?.() ?? 0;
          return `${n.group ? `<div class="group">${n.group}</div>` : ''}<a href="${n.href}" ${n.match.test(path) ? 'aria-current="page"' : ''}>${icon(n.ico, 18)}${n.label}${c ? `<span class="count">${c}</span>` : ''}</a>`;
        }).join('')}
        <div class="group">Guest view</div>
        <a href="#/r/${r.slug}" target="_blank" rel="noopener">${icon('link', 18)}Open guest app</a>
      </nav>
      <div class="a-user">
        <span class="avatar" aria-hidden="true">${esc(initials)}</span>
        <span><b style="font-weight:600">${esc(name)}</b><br><small class="faint">${state.session.role === 'manager' ? 'General Manager' : 'Wine Director'}</small></span>
        <button class="iconbtn" data-action="logout" aria-label="Log out" title="Log out">${icon('logout', 18)}</button>
      </div>
    </aside>
    <main class="a-main">${inner}</main>
  </div>`;
}

export function head(title: string, sub = '', actions = '', crumb?: { href: string; label: string }): string {
  return `${crumb ? `<a class="a-crumb" href="${crumb.href}">${icon('back', 16)}${esc(crumb.label)}</a>` : ''}
  <div class="a-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
}

export function statusBadge(status: string): string {
  const label: Record<string, string> = {
    suggested: 'Suggested', approved: 'Sommelier approved', modified: 'Sommelier modified', rejected: 'Rejected',
    published: 'Published', draft: 'Draft', hidden: 'Hidden'
  };
  return `<span class="badge badge-${status}">${label[status] ?? esc(status)}</span>`;
}

export function roleBadge(role: string | null): string {
  if (!role) return '';
  const label: Record<string, string> = { primary: 'Primary', alternative: 'Alternative', best_value: 'Best value' };
  return `<span class="badge ${role === 'best_value' ? 'badge-value' : role === 'primary' ? 'badge-somm' : 'badge-neutral'}">${label[role]}</span>`;
}

export function emptyBlock(title: string, text: string, action = ''): string {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
}
