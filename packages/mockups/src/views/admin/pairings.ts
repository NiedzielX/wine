import type { DishCategory, Pairing, PairingRole } from '@wine-match/core';
import { DEFAULT_PREFS } from '@wine-match/core';
import { recommendForDish } from '@wine-match/core';
import { pairingScore } from '@wine-match/core';
import {
  addManualPairing, approveAllSuggested, deletePairing, dishById, movePairing, orderedReviewed, setPairingComment,
  setPairingRole, setPairingStatus, state, wineById
} from '../../state/store';
import { esc, icon, toast, zl } from '../../ui/dom';
import { navigate, type View } from '../../ui/router';
import { adminShell, emptyBlock, head, requireLogin, roleBadge, statusBadge } from './shell';

const CATS: DishCategory[] = ['Starters', 'Mains', 'Desserts'];

function wineLine(p: Pairing): string {
  const w = wineById(p.wineId);
  if (!w) return '<span class="faint">Wine removed from list</span>';
  return `<div class="wn">${esc(w.producer)} ${esc(w.name)}</div>
    <div class="wsub">${w.vintage}, ${esc(w.region)}. ${w.glassPrice !== null ? `${zl(w.glassPrice)} glass, ` : 'Bottle only, '}${zl(w.bottlePrice)} bottle${w.active ? '' : '. <b style="color:var(--danger)">Not available</b>'}</div>`;
}

/* ------------------------------------------------------------------ Pairing management */
export const pairingManager: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Pairings',
  render: ({ dishId }) => {
    const dishes = state.dishes.filter((d) => d.status !== 'hidden');
    const dish = dishById(dishId ?? '') ?? dishes[0];
    if (!dish) return adminShell(`${head('Pairings')}<div class="panel">${emptyBlock('No dishes yet', 'Import your menu to start pairing.', '<a class="btn btn-primary" href="#/admin/import/menu">Import menu</a>')}</div>`);

    const reviewed = orderedReviewed(dish.id);
    const suggested = state.pairings.filter((p) => p.dishId === dish.id && p.status === 'suggested').sort((a, b) => b.modelScore - a.modelScore);
    const rejected = state.pairings.filter((p) => p.dishId === dish.id && p.status === 'rejected');
    const used = new Set(state.pairings.filter((p) => p.dishId === dish.id && p.status !== 'suggested').map((p) => p.wineId));
    const addable = state.wines.filter((w) => w.active && !used.has(w.id)).map((w) => ({ w, s: pairingScore(dish, w).score })).sort((a, b) => b.s - a.s);
    const guest = recommendForDish(dish, state.wines, state.pairings, { ...DEFAULT_PREFS });

    const side = CATS.map((c) => {
      const list = dishes.filter((d) => d.category === c);
      return `<div class="cat">${c}</div>${list.map((d) => {
        const n = state.pairings.filter((p) => p.dishId === d.id && (p.status === 'approved' || p.status === 'modified')).length;
        const s = state.pairings.filter((p) => p.dishId === d.id && p.status === 'suggested').length;
        return `<a href="#/admin/pairings/${d.id}" ${d.id === dish.id ? 'aria-current="page"' : ''}><span>${esc(d.name)}</span><span class="faint num" style="font-size:13px">${n}</span><small>${s ? `${s} to review` : n ? 'Reviewed' : 'No pairings'}</small></a>`;
      }).join('')}`;
    }).join('');

    const reviewedRows = reviewed.length ? reviewed.map((p, i) => `
      <div class="pair" data-id="${p.id}">
        <div class="pos">${i + 1}</div>
        <div>${wineLine(p)}
          <div class="meta">${statusBadge(p.status)}${roleBadge(p.role)}<span class="scorepill" title="Engine score">${p.modelScore}%</span>${p.dirty ? '<span class="badge badge-draft">Unpublished change</span>' : ''}</div>
          ${p.comment ? `<p class="cmt">“${esc(p.comment)}”</p>` : ''}
          <details style="margin-top:8px"><summary class="hint" style="cursor:pointer">${p.comment ? 'Edit note for guests' : 'Add a note for guests'}</summary>
            <div style="display:grid;gap:8px;margin-top:8px;max-width:520px">
              <textarea class="textarea" data-comment="${p.id}" maxlength="140" placeholder="Shown as “Why it works”. 140 characters.">${esc(p.comment ?? '')}</textarea>
              <div><button type="button" class="btn btn-s" data-save-comment="${p.id}">Save note</button></div>
            </div></details>
        </div>
        <div class="ctl">
          <select class="select" data-role="${p.id}" aria-label="Role">
            ${(['primary', 'alternative', 'best_value'] as PairingRole[]).map((r) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r === 'best_value' ? 'Best value' : r[0].toUpperCase() + r.slice(1)}</option>`).join('')}
          </select>
          <button type="button" class="iconbtn" data-move="${p.id}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
          <button type="button" class="iconbtn" data-move="${p.id}" data-dir="1" aria-label="Move down" ${i === reviewed.length - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>
          <button type="button" class="iconbtn" data-reject="${p.id}" aria-label="Reject" title="Reject: never recommend with this dish">${icon('close', 16)}</button>
          ${p.source === 'sommelier' ? `<button type="button" class="iconbtn" data-delete="${p.id}" aria-label="Delete" title="Delete pairing">${icon('trash', 16)}</button>` : ''}
        </div>
      </div>`).join('') : emptyBlock('No approved pairings yet', 'Approve an engine suggestion below, or add your own pairing.');

    return adminShell(`${head('Pairings', 'Your approved pairings always come first for guests. The engine fills the remaining places.', `<a class="btn" href="#/r/${state.restaurant.slug}/dish/${dish.id}/wines" target="_blank" rel="noopener">${icon('link', 18)}View as guest</a>`)}
      <div class="pm">
        <nav class="pm-list" aria-label="Dishes">${side}</nav>
        <div style="display:grid;gap:20px">
          <section class="panel"><header><div><h2 class="serif" style="font-size:24px;font-weight:500">${esc(dish.name)}</h2><small>${esc(dish.description)}</small></div><a class="btn btn-s" href="#/admin/menu/${dish.id}">Edit dish</a></header></section>
          <section class="panel"><header><h2>Approved for guests</h2><small>In this order</small></header><div class="body flush">${reviewedRows}</div></section>
          <section class="panel"><header><h2>Engine suggestions</h2>${suggested.length ? `<button type="button" class="btn btn-s" data-approve-all>Approve all ${suggested.length}</button>` : '<small>Nothing to review</small>'}</header><div class="body flush">
            ${suggested.length ? suggested.map((p) => {
              const w = wineById(p.wineId)!;
              return `<div class="pair"><div class="pos">${icon('star', 18)}</div><div>${wineLine(p)}<div class="meta">${statusBadge('suggested')}<span class="scorepill">${p.modelScore}%</span></div><p class="cmt" style="font-style:normal">${esc(pairingScore(dish, w).why)}</p></div>
              <div class="ctl"><button type="button" class="btn btn-s" data-approve="${p.id}">${icon('check', 16)}Approve</button><button type="button" class="btn btn-s btn-quiet btn-danger" data-reject="${p.id}">Reject</button></div></div>`;
            }).join('') : emptyBlock('All suggestions reviewed', 'New suggestions appear when you change the dish or the wine list.')}
          </div></section>
          <section class="panel"><header><h2>Add your own pairing</h2></header><div class="body">
            <form id="add-form" class="form-grid" novalidate>
              <label class="field full"><span>Wine</span><select class="select" name="wineId" required><option value="">Choose a wine</option>${addable.map(({ w, s }) => `<option value="${w.id}">${esc(w.producer)} ${esc(w.name)} (engine ${s}%)</option>`).join('')}</select></label>
              <label class="field"><span>Role</span><select class="select" name="role"><option value="alternative">Alternative</option><option value="primary">Primary recommendation</option><option value="best_value">Best value</option></select></label>
              <label class="field"><span>Note for guests (optional)</span><input class="input" name="comment" maxlength="140" placeholder="Why it works, in your words"></label>
              <p class="error-text full" id="add-error" role="alert" hidden></p>
              <div class="full"><button class="btn btn-primary" type="submit">${icon('plus', 18)}Add pairing</button></div>
            </form></div></section>
          ${rejected.length ? `<section class="panel"><header><h2>Rejected</h2><small>Never shown with this dish</small></header><div class="body flush">${rejected.map((p) => `<div class="pair"><div class="pos">–</div><div>${wineLine(p)}</div><div class="ctl"><button type="button" class="btn btn-s" data-restore="${p.id}">Restore as suggestion</button></div></div>`).join('')}</div></section>` : ''}
          <section class="panel"><header><h2>What guests see now</h2><small>No filters applied</small></header><div class="body"><div class="bars">
            ${guest.items.map((i, k) => `<div class="b" style="grid-template-columns:24px 1fr auto 46px"><span class="faint">${k + 1}</span><span>${esc(i.wine.producer)} ${esc(i.wine.name)}</span><span>${i.sommelier ? '<span class="badge badge-somm">Sommelier recommendation</span>' : ''}${i.bestValue ? ' <span class="badge badge-value">Best value</span>' : ''}</span><b>${i.matchScore}%</b></div>`).join('') || '<p class="faint">Nothing would be shown. Approve a pairing above.</p>'}
          </div></div></section>
        </div>
      </div>`);
  },
  mount: (root, { dishId }, _q, rerender) => {
    const dish = dishById(dishId ?? '') ?? state.dishes.find((d) => d.status !== 'hidden');
    if (!dish) return;
    root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t) return;
      const d = t.dataset;
      if (d.approve) { setPairingStatus(d.approve, 'approved'); setPairingRole(d.approve, orderedReviewed(dish.id).some((p) => p.role === 'primary') ? 'alternative' : 'primary'); toast('Pairing approved.'); rerender(); }
      else if (d.reject) { setPairingStatus(d.reject, 'rejected'); toast('Pairing rejected. It won’t be recommended with this dish.'); rerender(); }
      else if (d.restore) { setPairingStatus(d.restore, 'suggested'); rerender(); }
      else if (d.delete) { deletePairing(d.delete); toast('Pairing deleted.'); rerender(); }
      else if (d.move) { movePairing(d.move, Number(d.dir) as -1 | 1); rerender(); }
      else if (d.saveComment) {
        const ta = root.querySelector<HTMLTextAreaElement>(`[data-comment="${d.saveComment}"]`)!;
        setPairingComment(d.saveComment, ta.value); toast('Note saved.'); rerender();
      } else if ('approveAll' in d) { const n = approveAllSuggested(dish.id); toast(`${n} pairings approved.`); rerender(); }
    });
    root.querySelectorAll<HTMLSelectElement>('[data-role]').forEach((s) => s.addEventListener('change', () => {
      setPairingRole(s.dataset.role!, s.value as PairingRole); toast('Role updated.'); rerender();
    }));
    root.querySelector<HTMLFormElement>('#add-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const wineId = String(fd.get('wineId'));
      const err = root.querySelector<HTMLElement>('#add-error')!;
      if (!wineId) { err.textContent = 'Choose a wine to pair.'; err.hidden = false; return; }
      addManualPairing(dish.id, wineId, fd.get('role') as PairingRole, String(fd.get('comment') ?? ''));
      toast('Pairing added.');
      rerender();
    });
  }
};

/* ------------------------------------------------------------------ Review queue */
export const reviewQueue: View = {
  shell: 'admin',
  guard: requireLogin,
  title: () => 'Review queue',
  render: () => {
    const sug = state.pairings.filter((p) => p.status === 'suggested');
    const dishesWithAny = new Set(state.pairings.map((p) => p.dishId));
    const reviewedDishes = [...dishesWithAny].filter((id) => state.pairings.some((p) => p.dishId === id && (p.status === 'approved' || p.status === 'modified')));
    const progress = dishesWithAny.size ? reviewedDishes.length / dishesWithAny.size : 1;
    const byDish = state.dishes.filter((d) => sug.some((p) => p.dishId === d.id));
    return adminShell(`${head('Review queue', 'Pairings the engine proposed for your list. Nothing here is labelled as a sommelier recommendation until you approve it.', sug.length ? `<button class="btn btn-primary" data-approve-everything>${icon('check', 18)}Approve all ${sug.length}</button>` : '')}
      <section class="panel" style="margin-bottom:22px"><div class="body" style="display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between"><b>${reviewedDishes.length} of ${dishesWithAny.size} dishes have at least one approved pairing</b><span class="faint">${sug.length} suggestions left</span></div>
        <div class="progress"><i style="width:${Math.round(progress * 100)}%"></i></div>
      </div></section>
      ${byDish.length ? byDish.map((d) => {
        const list = sug.filter((p) => p.dishId === d.id).sort((a, b) => b.modelScore - a.modelScore);
        const hasPrimary = state.pairings.some((p) => p.dishId === d.id && p.role === 'primary' && p.status !== 'rejected');
        return `<section class="rq-dish">
          <header><div><b>${esc(d.name)}</b> <span class="faint" style="font-size:14px">${d.category}${hasPrimary ? '' : ', no primary pick yet'}</span></div>
            <div style="display:flex;gap:6px"><a class="btn btn-s" href="#/admin/pairings/${d.id}">Open pairings</a><button class="btn btn-s" data-approve-dish="${d.id}">Approve all for this dish</button></div></header>
          ${list.map((p) => {
            const w = wineById(p.wineId)!;
            return `<div class="rq-row"><div><b>${esc(w.producer)} ${esc(w.name)}</b> <span class="faint">${w.vintage}</span><div class="why">${esc(pairingScore(d, w).why)}</div></div>
              <div><span class="scorepill">${p.modelScore}% match</span></div>
              <div style="display:flex;gap:6px;justify-content:flex-end"><button class="btn btn-s" data-approve="${p.id}" data-dish="${d.id}">${icon('check', 16)}Approve</button><button class="btn btn-s btn-quiet btn-danger" data-reject="${p.id}">Reject</button></div></div>`;
          }).join('')}
        </section>`;
      }).join('') : `<div class="panel">${emptyBlock('Everything is reviewed', 'Guests now only see pairings you’ve approved, plus engine picks in the remaining places.', '<a class="btn btn-primary" href="#/admin/publish">Go to publish</a>')}</div>`}`);
  },
  mount: (root, _p, _q, rerender) => {
    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      const d = b.dataset;
      if (d.approve) {
        setPairingStatus(d.approve, 'approved');
        setPairingRole(d.approve, orderedReviewed(d.dish!).some((p) => p.role === 'primary') ? 'alternative' : 'primary');
        toast('Pairing approved.'); rerender();
      } else if (d.reject) { setPairingStatus(d.reject, 'rejected'); toast('Pairing rejected.'); rerender(); }
      else if (d.approveDish) { const n = approveAllSuggested(d.approveDish); toast(`${n} pairings approved.`); rerender(); }
      else if ('approveEverything' in d) {
        const n = approveAllSuggested();
        toast(`${n} pairings approved.`);
        navigate('#/admin/publish');
      }
    });
  }
};
