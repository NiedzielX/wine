import QRCode from 'qrcode';
import type { Dish, DishCategory, Wine } from '@wine-match/core';
import {
  SAMPLE_MENU_CSV, SAMPLE_WINES_CSV, draftDishProfile, draftWineProfile, parseCsv, rowsToMenu, rowsToWines,
  type MenuRow, type WineRow
} from '@wine-match/core';
import { ENGINE_VERSION } from '@wine-match/core';
import { dirtyCount, generateSuggestions, newId, publish, resetDemo, save, state, track } from '../../state/store';
import { esc, fmtDate, icon, toast } from '../../ui/dom';
import { navigate, type View } from '../../ui/router';
import { adminShell, head, requireLogin } from './shell';

/* ------------------------------------------------------------------ Import (shared) */

type Kind = 'menu' | 'wines';
const drafts: { menu: MenuRow[] | null; wines: WineRow[] | null; file: Record<Kind, string> } = { menu: null, wines: null, file: { menu: '', wines: '' } };

function steps(active: number): string {
  const labels = ['Upload file', 'Check and correct', 'Imported'];
  return `<div class="steps" aria-label="Import steps">${labels.map((l, i) => `<div class="${i === active ? 'on' : i < active ? 'done' : ''}"><span class="n">${i < active ? '✓' : i + 1}</span>${l}</div>`).join('')}</div>`;
}

function uploadStep(kind: Kind): string {
  const what = kind === 'menu' ? 'menu' : 'wine list';
  return `${steps(0)}
    <label class="drop" id="drop">
      ${icon('upload', 28)}
      <h2>Upload your ${what}</h2>
      <p>${kind === 'menu' ? 'One dish per row with name, description, category and price.' : 'One wine per row with producer, wine, vintage, region, grape, style, glass and bottle price.'} You’ll check everything before it’s saved.</p>
      <span class="formats">CSV, Excel (.xlsx) or PDF, up to 10 MB</span>
      <input type="file" id="file" accept=".csv,.xlsx,.xls,.pdf,text/csv" class="sr-only">
      <span class="btn btn-primary">Choose file</span>
    </label>
    <p class="error-text" id="upload-error" role="alert" hidden style="margin-top:10px"></p>
    <div style="display:flex;gap:10px;margin-top:16px;align-items:center;flex-wrap:wrap">
      <button class="btn" data-sample>Use sample file</button>
      <a class="btn btn-quiet" href="data:text/csv;charset=utf-8,${encodeURIComponent(kind === 'menu' ? SAMPLE_MENU_CSV : SAMPLE_WINES_CSV)}" download="winematch-${kind}-template.csv">Download CSV template</a>
    </div>`;
}

function menuPreview(rows: MenuRow[]): string {
  const bad = rows.filter((r) => !r.name || r.price === null).length;
  return `${steps(1)}
    <div class="a-banner"><span>${rows.length} dishes found in <b>${esc(drafts.file.menu)}</b>. ${bad ? `${bad} need a fix before import.` : 'Everything looks complete.'} Taste profiles are drafted from the descriptions; you can adjust them later.</span></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Import</th><th>Name</th><th>Description</th><th>Category</th><th class="r">Price (zł)</th><th>Drafted profile</th><th>Checks</th></tr></thead><tbody>
      ${rows.map((r, i) => {
        const prof = draftDishProfile(r.name, r.description, r.category);
        return `<tr><td><input type="checkbox" data-include="${i}" ${r.name ? 'checked' : ''} aria-label="Import row"></td>
          <td><input class="input" data-f="name" data-i="${i}" value="${esc(r.name)}" ${!r.name ? 'aria-invalid="true"' : ''}></td>
          <td><input class="input" data-f="description" data-i="${i}" value="${esc(r.description)}"></td>
          <td><select class="select" data-f="category" data-i="${i}">${(['Starters', 'Mains', 'Desserts'] as DishCategory[]).map((c) => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
          <td><input class="input" style="width:90px;text-align:right" data-f="price" data-i="${i}" type="number" min="1" value="${r.price ?? ''}" ${r.price === null ? 'aria-invalid="true"' : ''}></td>
          <td class="sub">${prof.protein}, ${prof.cooking}, intensity ${prof.intensity}</td>
          <td>${r.issues.length ? r.issues.map((x) => `<div class="row-flag">${esc(x)}</div>`).join('') : '<span class="badge badge-approved">OK</span>'}</td></tr>`;
      }).join('')}
    </tbody></table></div>
    <p class="error-text" id="import-error" role="alert" hidden style="margin-top:10px"></p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button class="btn" data-cancel>Start over</button><button class="btn btn-primary" data-confirm>Import selected dishes</button></div>`;
}

function winePreview(rows: WineRow[]): string {
  const bad = rows.filter((r) => !r.producer || r.bottlePrice === null).length;
  return `${steps(1)}
    <div class="a-banner"><span>${rows.length} wines found in <b>${esc(drafts.file.wines)}</b>. ${bad ? `${bad} need a fix before import.` : 'Everything looks complete.'} Wine profiles start from grape and style defaults.</span></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Import</th><th>Producer</th><th>Wine</th><th>Vintage</th><th>Grape</th><th>Style</th><th class="r">Glass</th><th class="r">Bottle</th><th>Checks</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td><input type="checkbox" data-include="${i}" ${r.producer ? 'checked' : ''} aria-label="Import row"></td>
        <td><input class="input" data-f="producer" data-i="${i}" value="${esc(r.producer)}" ${!r.producer ? 'aria-invalid="true"' : ''}></td>
        <td><input class="input" data-f="name" data-i="${i}" value="${esc(r.name)}"></td>
        <td><input class="input" style="width:72px" data-f="vintage" data-i="${i}" value="${esc(r.vintage)}"></td>
        <td><input class="input" data-f="grape" data-i="${i}" value="${esc(r.grape)}"></td>
        <td>${esc(r.style)}</td>
        <td><input class="input" style="width:80px;text-align:right" data-f="glassPrice" data-i="${i}" type="number" min="1" value="${r.glassPrice ?? ''}" placeholder="—"></td>
        <td><input class="input" style="width:90px;text-align:right" data-f="bottlePrice" data-i="${i}" type="number" min="1" value="${r.bottlePrice ?? ''}" ${r.bottlePrice === null ? 'aria-invalid="true"' : ''}></td>
        <td>${r.issues.length ? r.issues.map((x) => `<div class="row-flag">${esc(x)}</div>`).join('') : '<span class="badge badge-approved">OK</span>'}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="error-text" id="import-error" role="alert" hidden style="margin-top:10px"></p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px"><button class="btn" data-cancel>Start over</button><button class="btn btn-primary" data-confirm>Import selected wines</button></div>`;
}

function doneStep(kind: Kind, n: number): string {
  return `${steps(2)}<section class="panel"><div class="body" style="display:grid;gap:12px;justify-items:start;padding:28px">
    <h2 class="serif" style="font-size:26px;font-weight:500">${n} ${kind === 'menu' ? 'dishes' : 'wines'} imported</h2>
    <p class="muted">${kind === 'menu' ? 'New dishes are saved as drafts with drafted taste profiles. The engine has prepared pairing suggestions for each one.' : 'New wines are active. The engine has refreshed suggestions across the menu.'}</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="#/admin/review">Review suggestions</a><a class="btn" href="${kind === 'menu' ? '#/admin/menu' : '#/admin/wines'}">Open ${kind === 'menu' ? 'menu' : 'wine list'}</a></div>
  </div></section>`;
}

function importView(kind: Kind): View {
  return {
    shell: 'admin',
    guard: requireLogin,
    title: () => (kind === 'menu' ? 'Import menu' : 'Import wine list'),
    render: (_p, q) => {
      const stepName = q.get('step');
      const title = kind === 'menu' ? 'Import menu' : 'Import wine list';
      const sub = kind === 'menu' ? 'Bring in dishes from a PDF, Excel or CSV file.' : 'Bring in wines and prices from a PDF, Excel or CSV file.';
      let body: string;
      if (stepName === 'done') body = doneStep(kind, Number(q.get('n') ?? 0));
      else if (stepName === 'preview' && drafts[kind]) body = kind === 'menu' ? menuPreview(drafts.menu!) : winePreview(drafts.wines!);
      else body = uploadStep(kind);
      return adminShell(`${head(title, sub)}${body}`);
    },
    mount: (root, _p, q) => {
      const step = q.get('step');
      if (!step || (step === 'preview' && !drafts[kind])) {
        const input = root.querySelector<HTMLInputElement>('#file')!;
        const drop = root.querySelector<HTMLElement>('#drop')!;
        const err = root.querySelector<HTMLElement>('#upload-error')!;
        const accept = (name: string, text: string | null) => {
          const ext = name.split('.').pop()?.toLowerCase() ?? '';
          if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext)) { err.textContent = `“${name}” isn’t a CSV, Excel or PDF file.`; err.hidden = false; return; }
          // CSV is parsed in the browser. PDF/Excel are parsed server-side in production;
          // the mockup substitutes the sample rows so the flow can be clicked through.
          const csv = ext === 'csv' && text ? text : kind === 'menu' ? SAMPLE_MENU_CSV : SAMPLE_WINES_CSV;
          const rows = parseCsv(csv);
          if (rows.length < 2) { err.textContent = 'The file has no data rows. Check that the first row holds column names.'; err.hidden = false; return; }
          drafts.file[kind] = name;
          if (kind === 'menu') drafts.menu = rowsToMenu(rows); else drafts.wines = rowsToWines(rows);
          track('import_file_parsed', { kind, rows: rows.length - 1, format: ext });
          navigate(`#/admin/import/${kind}?step=preview`);
        };
        const read = (f: File) => {
          if (f.size > 10 * 1024 * 1024) { err.textContent = 'File is larger than 10 MB.'; err.hidden = false; return; }
          if (f.name.toLowerCase().endsWith('.csv')) { const r = new FileReader(); r.onload = () => accept(f.name, String(r.result)); r.readAsText(f); } else accept(f.name, null);
        };
        input.addEventListener('change', () => { if (input.files?.[0]) read(input.files[0]); });
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files[0]; if (f) read(f); });
        root.querySelector('[data-sample]')?.addEventListener('click', () => accept(kind === 'menu' ? 'halka-menu-autumn.csv' : 'halka-wine-list.csv', kind === 'menu' ? SAMPLE_MENU_CSV : SAMPLE_WINES_CSV));
        return;
      }
      if (step !== 'preview') return;
      const rows = (kind === 'menu' ? drafts.menu : drafts.wines) as unknown as Array<Record<string, unknown>>;
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-f]').forEach((el) => el.addEventListener('input', () => {
        const i = Number(el.dataset.i); const f = el.dataset.f!;
        rows[i][f] = el instanceof HTMLInputElement && el.type === 'number' ? (el.value ? Number(el.value) : null) : el.value;
        el.removeAttribute('aria-invalid');
      }));
      root.querySelector('[data-cancel]')?.addEventListener('click', () => { drafts[kind] = null; navigate(`#/admin/import/${kind}`); });
      root.querySelector('[data-confirm]')?.addEventListener('click', () => {
        const included = [...root.querySelectorAll<HTMLInputElement>('[data-include]')].filter((c) => c.checked).map((c) => Number(c.dataset.include));
        const err = root.querySelector<HTMLElement>('#import-error')!;
        if (!included.length) { err.textContent = 'Select at least one row to import.'; err.hidden = false; return; }
        if (kind === 'menu') {
          const sel = included.map((i) => drafts.menu![i]);
          const invalid = sel.findIndex((r) => !r.name.trim() || !(Number(r.price) > 0));
          if (invalid >= 0) { err.textContent = `Row ${included[invalid] + 1}: add a name and a price, or untick it.`; err.hidden = false; return; }
          const created: Dish[] = sel.map((r) => ({
            id: newId('d'), name: r.name.trim(), description: r.description.trim(), category: r.category, price: Number(r.price),
            status: 'draft', profile: draftDishProfile(r.name, r.description, r.category)
          }));
          state.dishes.push(...created);
          state.pairings.push(...generateSuggestions(created, state.wines).map((p) => ({ ...p, id: newId('p'), dirty: true })));
          save(); drafts.menu = null;
          track('import_confirmed', { kind, count: created.length });
          navigate(`#/admin/import/menu?step=done&n=${created.length}`);
        } else {
          const sel = included.map((i) => drafts.wines![i]);
          const invalid = sel.findIndex((r) => !r.producer.trim() || !(Number(r.bottlePrice) > 0));
          if (invalid >= 0) { err.textContent = `Row ${included[invalid] + 1}: add a producer and a bottle price, or untick it.`; err.hidden = false; return; }
          const created: Wine[] = sel.map((r) => {
            const profile = draftWineProfile(r.grape, r.style);
            return {
              id: newId('w'), producer: r.producer.trim(), name: r.name.trim() || r.grape || 'Cuvée', vintage: /^\d{4}$/.test(r.vintage) ? Number(r.vintage) : 'NV',
              region: r.region, country: '', grapes: r.grape ? [r.grape] : [], glassPrice: r.glassPrice ? Number(r.glassPrice) : null, glassPour: profile.style === 'sweet' ? 75 : 150,
              bottlePrice: Number(r.bottlePrice), bottleSize: 750, active: true,
              colour: profile.style === 'red' ? '#6E1F33' : profile.style === 'rose' ? '#EBB3A0' : profile.style === 'orange' ? '#D89B4E' : '#E4D79A',
              tastingNote: '', profile
            };
          });
          state.wines.push(...created);
          const fresh = generateSuggestions(state.dishes, state.wines).filter((s) => created.some((w) => w.id === s.wineId));
          state.pairings.push(...fresh.map((p) => ({ ...p, id: newId('p'), dirty: true })));
          save(); drafts.wines = null;
          track('import_confirmed', { kind, count: created.length });
          navigate(`#/admin/import/wines?step=done&n=${created.length}`);
        }
      });
    }
  };
}

export const importMenu = importView('menu');
export const importWines = importView('wines');

/* ------------------------------------------------------------------ Publish */
export const publishView: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Publish',
  render: () => {
    const published = state.dishes.filter((d) => d.status !== 'hidden');
    const noPrimary = published.filter((d) => !state.pairings.some((p) => p.dishId === d.id && p.role === 'primary' && (p.status === 'approved' || p.status === 'modified')));
    const draftProfiles = published.filter((d) => d.profile.source === 'draft');
    const suggested = state.pairings.filter((p) => p.status === 'suggested').length;
    const draftDishes = state.dishes.filter((d) => d.status === 'draft');
    const changes = dirtyCount();
    const item = (ok: boolean, title: string, detail: string, link?: string) => `<div class="ci"><span class="${ok ? 'ok' : 'warn'}">${icon(ok ? 'check' : 'info', 20)}</span><div><b style="font-weight:600">${title}</b><div class="hint">${detail}</div></div>${link ?? ''}</div>`;
    return adminShell(`${head('Publish', `Last published ${fmtDate(state.restaurant.publishedAt)}. Guests see the published version through the QR code.`)}
      <div class="a-grid" style="margin-top:0">
        <section class="panel span-7"><header><h2>Before you publish</h2><small>Recommended, not required</small></header><div class="checklist">
          ${item(noPrimary.length === 0, noPrimary.length ? `${noPrimary.length} dishes have no primary pick` : 'Every dish has a primary pick', noPrimary.length ? esc(noPrimary.slice(0, 4).map((d) => d.name).join(', ')) + (noPrimary.length > 4 ? '…' : '') : 'Guests always see your first choice first.', noPrimary.length ? `<a class="btn btn-s" href="#/admin/pairings/${noPrimary[0].id}">Fix</a>` : '')}
          ${item(suggested === 0, suggested ? `${suggested} engine suggestions not reviewed` : 'All suggestions reviewed', state.settings.showUnreviewed ? 'Unreviewed suggestions can still appear as “Best match”, never as a sommelier recommendation.' : 'Unreviewed suggestions are hidden from guests.', suggested ? '<a class="btn btn-s" href="#/admin/review">Review</a>' : '')}
          ${item(draftProfiles.length === 0, draftProfiles.length ? `${draftProfiles.length} taste profiles are still drafts` : 'All taste profiles confirmed', draftProfiles.length ? esc(draftProfiles.map((d) => d.name).join(', ')) : 'Scores are based on profiles you checked.', draftProfiles.length ? `<a class="btn btn-s" href="#/admin/menu/${draftProfiles[0].id}">Check</a>` : '')}
          ${item(draftDishes.length === 0, draftDishes.length ? `${draftDishes.length} new dishes will go live` : 'No new dishes', draftDishes.length ? esc(draftDishes.map((d) => d.name).join(', ')) : 'Menu unchanged since last publish.')}
        </div></section>
        <section class="panel span-5"><header><h2>Guest settings</h2></header><div class="body" style="display:grid;gap:16px">
          <label class="switch"><input type="checkbox" data-setting="showUnreviewed" ${state.settings.showUnreviewed ? 'checked' : ''}> Fill empty places with engine picks</label>
          <p class="hint" style="margin-top:-8px">When off, guests only see pairings you approved.</p>
          <label class="switch"><input type="checkbox" data-setting="showScores" ${state.settings.showScores ? 'checked' : ''}> Show match percentages to guests</label>
          <p class="hint" style="margin-top:-8px">The glass icon is always shown. Engine ${ENGINE_VERSION}.</p>
        </div></section>
        <section class="panel span-12"><div class="body" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;padding:20px">
          <div><b style="font-size:17px">${changes ? `${changes} unpublished ${changes === 1 ? 'change' : 'changes'}` : 'Guests see the latest version'}</b><div class="hint">Publishing updates the guest app immediately. No reprint of QR codes needed.</div></div>
          <div style="display:flex;gap:10px"><a class="btn" href="#/r/${state.restaurant.slug}" target="_blank" rel="noopener">Preview guest app</a><button class="btn btn-primary" data-publish ${changes ? '' : 'disabled'}>${icon('publish', 18)}Publish changes</button></div>
        </div></section>
      </div>`);
  },
  mount: (root, _p, _q, rerender) => {
    root.querySelector('[data-publish]')?.addEventListener('click', () => {
      const n = publish();
      toast(`Published ${n} ${n === 1 ? 'change' : 'changes'}. Guests see them now.`);
      rerender();
    });
    root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((cb) => cb.addEventListener('change', () => {
      const k = cb.dataset.setting as 'showUnreviewed' | 'showScores';
      state.settings[k] = cb.checked;
      save();
      track('guest_setting_changed', { [k]: cb.checked });
      toast('Setting saved.');
    }));
  }
};

/* ------------------------------------------------------------------ QR */
export const qrView: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'QR code',
  render: () => {
    const r = state.restaurant;
    const publicUrl = `https://winematch.app/${r.slug}`;
    return adminShell(`${head('QR code', 'Place it on table tents, the wine list or the bill folder. The code never changes when you update pairings.')}
      <div class="qr-wrap">
        <section class="tent" id="tent">
          <div class="venue">${esc(r.name)}</div>
          <p class="line">Scan to find the wine for your dish</p>
          <div id="qr" aria-label="QR code for ${esc(publicUrl)}"><div class="skeleton" style="width:220px;height:220px"></div></div>
          <span class="url">winematch.app/${esc(r.slug)}</span>
        </section>
        <section class="panel"><header><h2>Link and downloads</h2></header><div class="body" style="display:grid;gap:14px">
          <label class="field"><span>Public link</span><input class="input" readonly value="${publicUrl}" id="pub-url"></label>
          <button class="btn" data-copy>${icon('link', 18)}Copy link</button>
          <button class="btn" data-dl="svg">Download SVG for print</button>
          <button class="btn" data-dl="png">Download PNG</button>
          <button class="btn" data-print>Print table tent</button>
          <a class="btn btn-quiet" href="#/r/${r.slug}" target="_blank" rel="noopener">Open guest app</a>
          <p class="hint">Local demo link: <code>${location.origin}${location.pathname}#/r/${r.slug}</code></p>
        </div></section>
      </div>`);
  },
  mount: (root) => {
    const r = state.restaurant;
    const url = `https://winematch.app/${r.slug}`;
    const opts = { margin: 1, color: { dark: '#22181d', light: '#ffffff' }, errorCorrectionLevel: 'M' as const };
    QRCode.toString(url, { ...opts, type: 'svg' }).then((svg) => {
      const holder = root.querySelector('#qr');
      if (holder) holder.innerHTML = svg.replace('<svg', '<svg class="qr"');
    }).catch(() => { const h = root.querySelector('#qr'); if (h) h.innerHTML = '<p class="error-text">The QR code could not be generated. Reload the page.</p>'; });
    const download = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
    root.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { root.querySelector<HTMLInputElement>('#pub-url')?.select(); toast('Select and copy the link.'); }
    });
    root.querySelectorAll<HTMLElement>('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.dl === 'svg') {
        const svg = await QRCode.toString(url, { ...opts, type: 'svg' });
        download(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, `winematch-${r.slug}-qr.svg`);
      } else {
        download(await QRCode.toDataURL(url, { ...opts, width: 1024 }), `winematch-${r.slug}-qr.png`);
      }
      track('qr_downloaded', { format: b.dataset.dl });
    }));
    root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  }
};

/* ------------------------------------------------------------------ Setup checklist (restaurant onboarding) */
export const setupView: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Setup checklist',
  render: () => {
    const r = state.restaurant;
    const reviewed = new Set(state.pairings.filter((p) => p.status === 'approved' || p.status === 'modified').map((p) => p.dishId));
    const confirmed = state.dishes.filter((d) => d.profile.source === 'confirmed').length;
    const stepsList: Array<{ title: string; detail: string; done: boolean; href?: string; action?: string }> = [
      { title: 'Restaurant details', detail: `${r.name}, ${r.address}. Link: winematch.app/${r.slug}`, done: true },
      { title: 'Upload menu', detail: `${state.dishes.length} dishes`, done: state.dishes.length > 0, href: '#/admin/import/menu' },
      { title: 'Upload wine list', detail: `${state.wines.length} wines, ${state.wines.filter((w) => w.glassPrice !== null).length} by the glass`, done: state.wines.length > 0, href: '#/admin/import/wines' },
      { title: 'Check data', detail: `${confirmed} of ${state.dishes.length} taste profiles confirmed`, done: confirmed === state.dishes.length, href: '#/admin/menu' },
      { title: 'Generate pairings', detail: `${state.pairings.length} pairings, engine ${ENGINE_VERSION}`, done: state.pairings.length > 0, action: 'regenerate' },
      { title: 'Sommelier review', detail: `${reviewed.size} of ${state.dishes.length} dishes reviewed`, done: reviewed.size === state.dishes.length, href: '#/admin/review' },
      { title: 'Publish', detail: `Last published ${fmtDate(r.publishedAt)}`, done: !!r.publishedAt && dirtyCount() === 0, href: '#/admin/publish' },
      { title: 'Place QR codes', detail: 'Table tents, wine list, bill folder', done: !!r.publishedAt, href: '#/admin/qr' }
    ];
    return adminShell(`${head('Setup checklist', 'The path from a new restaurant to guests scanning the QR code.', '<button class="btn btn-quiet" data-reset>' + icon('reset', 18) + 'Reset demo data</button>')}
      <section class="panel" style="margin-bottom:20px"><header><h2>Restaurant details</h2></header><div class="body">
        <form id="rest-form" class="form-grid" novalidate>
          <label class="field"><span>Restaurant name</span><input class="input" name="name" value="${esc(r.name)}" required></label>
          <label class="field"><span>Public link</span><input class="input" name="slug" value="${esc(r.slug)}" pattern="[a-z0-9-]+" required aria-describedby="slug-hint"><small class="hint" id="slug-hint">Lowercase letters, numbers and dashes. Changing it breaks printed QR codes.</small></label>
          <label class="field"><span>Address</span><input class="input" name="address" value="${esc(r.address)}"></label>
          <label class="field"><span>Wine Director</span><input class="input" name="wineDirector" value="${esc(r.wineDirector)}"></label>
          <p class="error-text full" id="rest-error" role="alert" hidden></p>
          <div class="full"><button class="btn" type="submit">Save details</button></div>
        </form></div></section>
      <section class="panel"><div class="checklist">
        ${stepsList.map((s, i) => `<div class="ci"><span class="${s.done ? 'ok' : 'warn'} num" style="font-weight:600">${s.done ? icon('check', 20) : i + 1}</span>
          <div><b style="font-weight:600">${s.title}</b><div class="hint">${esc(s.detail)}</div></div>
          ${s.action ? '<button class="btn btn-s" data-regenerate>Regenerate suggestions</button>' : s.href ? `<a class="btn btn-s" href="${s.href}">${s.done ? 'Open' : 'Start'}</a>` : ''}</div>`).join('')}
      </div></section>`);
  },
  mount: (root, _p, _q, rerender) => {
    root.querySelector('[data-regenerate]')?.addEventListener('click', () => {
      const keep = state.pairings.filter((p) => p.status !== 'suggested');
      const fresh = generateSuggestions(state.dishes, state.wines).filter((s) => !keep.some((k) => k.dishId === s.dishId && k.wineId === s.wineId));
      state.pairings = [...keep, ...fresh];
      save();
      track('pairings_regenerated', { suggestions: fresh.length });
      toast(`${fresh.length} suggestions ready for review.`);
      rerender();
    });
    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      if (!confirm('Reset all demo data to the original Halka setup?')) return;
      const session = { ...state.session };
      resetDemo();
      state.session = session;
      save();
      toast('Demo data reset.');
      rerender();
    });
    root.querySelector<HTMLFormElement>('#rest-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const err = root.querySelector<HTMLElement>('#rest-error')!;
      const slug = String(fd.get('slug')).trim();
      const name = String(fd.get('name')).trim();
      if (!name) { err.textContent = 'Restaurant name is required.'; err.hidden = false; return; }
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) { err.textContent = 'Public link: 2–40 lowercase letters, numbers or dashes.'; err.hidden = false; return; }
      Object.assign(state.restaurant, { name, slug, address: String(fd.get('address')).trim(), wineDirector: String(fd.get('wineDirector')).trim() || state.restaurant.wineDirector });
      save();
      toast('Details saved.');
      rerender();
    });
  }
};

