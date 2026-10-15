import '@fontsource-variable/bodoni-moda';
import '@fontsource-variable/hanken-grotesk';
import './styles/base.css';
import './styles/guest.css';
import './styles/admin.css';

import { save, state, track } from './state/store';
import { esc, icon } from './ui/dom';
import { navigate, route, setNotFound, start, type View } from './ui/router';
import * as G from './views/guest/screens';
import * as A from './views/admin/catalog';
import * as P from './views/admin/pairings';
import * as L from './views/admin/golive';

const hub: View = {
  shell: 'plain',
  title: () => 'Mockups',
  render: () => {
    const s = state.restaurant.slug;
    const d = 'd_duck';
    const link = (href: string, title: string, sub: string) => `<a href="${href}"><b>${title}</b><small>${sub}</small><code>${esc(href.replace(/^#/, ''))}</code></a>`;
    return `<div class="hub">
      <a class="a-brand" href="#/"><span class="mark">${icon('glass', 18)}</span><b>Wine Match</b></a>
      <h1 style="margin-top:36px">Clickable MVP mockups</h1>
      <p>Two applications sharing one deterministic pairing engine: a mobile-first guest app reached by QR code, and a desktop-first dashboard for the sommelier and the restaurant team. The demo restaurant is Halka in Warsaw.</p>
      <div class="hub-cols">
        <section class="hub-col"><h2>Guest app (open on a phone or narrow window)</h2>
          ${link(`#/r/${s}`, 'Restaurant landing', 'What the QR code opens')}
          ${link(`#/r/${s}/menu`, 'Dish list', 'Pick the dish you order')}
          ${link(`#/r/${s}/dish/${d}`, 'Dish details', 'Taste summary and quick preferences')}
          ${link(`#/r/${s}/dish/${d}/wines`, 'Wine recommendations', 'Best match, alternatives, why it works')}
          ${link(`#/r/${s}/dish/${d}/wines?sheet=filters`, 'Filters', 'Glass or bottle, style, budget, body, mood')}
          ${link(`#/r/${s}/table`, 'Whole table selection', 'Choose several dishes')}
          ${link(`#/r/${s}/table/result`, 'Best wine for your table', 'One bottle for everything (select 2+ dishes first)')}
          ${link(`#/r/${s}/wine/w_savigny?dish=${d}`, 'Wine details', 'Profile, note, glass or bottle')}
          ${link(`#/r/${s}/selected/w_savigny?serving=glass&dish=${d}`, 'Selection confirmation', 'Show this to your waiter')}
          ${link(`#/r/${s}/staff`, 'Waiter lookup', 'Same engine for the floor team')}
          ${link(`#/r/${s}/dish/${d}/wines?demo=loading`, 'State: loading', 'Any guest list screen accepts ?demo=loading|empty|error')}
          ${link(`#/r/unknown-place`, 'State: unknown restaurant', 'Broken or old QR link')}
        </section>
        <section class="hub-col"><h2>Restaurant and sommelier dashboard</h2>
          ${link('#/admin/login', 'Login', 'Demo credentials filled in')}
          ${link('#/admin', 'Dashboard', 'Attach rate, revenue, conversion')}
          ${link('#/admin/menu', 'Menu', 'Dishes, status, pairing coverage')}
          ${link(`#/admin/menu/${d}`, 'Dish details', 'Taste profile with live match preview')}
          ${link('#/admin/wines', 'Wine list', 'Prices, glass availability, active')}
          ${link('#/admin/wines/w_graillot', 'Wine details', 'Profile and best dishes')}
          ${link(`#/admin/pairings/${d}`, 'Pairing management', 'Order, roles, notes, add, reject')}
          ${link('#/admin/review', 'Pairing review', 'Approve engine suggestions')}
          ${link('#/admin/import/menu', 'Import menu', 'Upload, check, import')}
          ${link('#/admin/import/wines', 'Import wine list', 'Upload, check, import')}
          ${link('#/admin/setup', 'Setup checklist', 'Restaurant onboarding flow')}
          ${link('#/admin/publish', 'Publish', 'Checks and guest settings')}
          ${link('#/admin/qr', 'QR generation', 'Table tent, SVG and PNG downloads')}
        </section>
      </div>
    </div>`;
  }
};

const notFound: View = {
  shell: 'plain',
  title: () => 'Not found',
  render: () => `<div class="hub"><h1>Page not found</h1><p>This address doesn’t exist in the mockup.</p><p style="margin-top:20px"><a class="btn btn-primary" href="#/">Go to the mockup index</a></p></div>`
};

route('/', hub);
route('/r/:slug', G.landing);
route('/r/:slug/menu', G.menu);
route('/r/:slug/dish/:dishId', G.dishDetails);
route('/r/:slug/dish/:dishId/wines', G.recommendations);
route('/r/:slug/wine/:wineId', G.wineDetails);
route('/r/:slug/selected/:wineId', G.confirmation);
route('/r/:slug/table', G.tableSelect);
route('/r/:slug/table/result', G.tableResult);
route('/r/:slug/staff', G.staff);

route('/admin/login', A.login);
route('/admin', A.dashboard);
route('/admin/menu', A.menuList);
route('/admin/menu/:id', A.dishEdit);
route('/admin/wines', A.wineList);
route('/admin/wines/:id', A.wineEdit);
route('/admin/pairings', P.pairingManager);
route('/admin/pairings/:dishId', P.pairingManager);
route('/admin/review', P.reviewQueue);
route('/admin/import/menu', L.importMenu);
route('/admin/import/wines', L.importWines);
route('/admin/publish', L.publishView);
route('/admin/qr', L.qrView);
route('/admin/setup', L.setupView);
setNotFound(notFound);

document.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action="logout"]');
  if (!t) return;
  track('staff_logout');
  state.session = { staffName: null, role: null };
  save();
  navigate('#/admin/login');
});

start();
