'use server';

import { act, str, version } from '@/server/action-runner';

/**
 * Server actions of the dashboard: plain form posts that call a service and redirect back with the
 * result in the URL (`?saved=…` / `?error=…`). They work without JavaScript.
 * Rules live in @wine-match/core; this file only reads the form, calls the service and reports.
 */

export async function approvePairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.approve(slug, str(f, 'pairingId'), actor, version(f)); return { saved: 'approved' }; });
}

export async function rejectPairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.reject(slug, str(f, 'pairingId'), actor, version(f)); return { saved: 'rejected' }; });
}

export async function restorePairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.restore(slug, str(f, 'pairingId'), actor, version(f)); return { saved: 'restored' }; });
}

export async function setPairingRole(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.setRole(slug, str(f, 'pairingId'), str(f, 'role'), actor, version(f)); return { saved: 'role' }; });
}

export async function savePairingNote(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.setComment(slug, str(f, 'pairingId'), str(f, 'comment'), actor, version(f)); return { saved: 'note' }; });
}

export async function movePairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => {
    const dir = str(f, 'direction') === 'up' ? 'up' : 'down';
    await c.sommelierService.move(slug, str(f, 'pairingId'), dir, actor, version(f));
    return { saved: 'moved' };
  });
}

export async function deletePairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.sommelierService.deleteManual(slug, str(f, 'pairingId'), actor, version(f)); return { saved: 'deleted' }; });
}

export async function addPairing(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => {
    await c.sommelierService.addManual(slug, { dishId: str(f, 'dishId'), wineId: str(f, 'wineId'), role: str(f, 'role') || null, comment: str(f, 'comment') }, actor);
    return { saved: 'added' };
  });
}

/** `dishId` empty = every dish with suggestions. */
export async function approveAllPairings(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => {
    const n = await c.sommelierService.approveAll(slug, actor, str(f, 'dishId') || undefined);
    return { saved: 'approved_all', n: String(n) };
  });
}

export async function setWineAvailability(form: FormData) {
  return act(form, 'wines.toggle', async ({ c, slug, form: f }) => {
    const active = str(f, 'active') === 'true';
    await c.sommelierService.setWineActive(slug, str(f, 'wineId'), active);
    return { saved: active ? 'wine_shown' : 'wine_hidden' };
  });
}

export async function publishChanges(form: FormData) {
  return act(form, 'publish', async ({ c, slug, actor }) => {
    const v = await c.publishService.publish(slug, actor);
    return { saved: 'published', n: String(v.number) };
  });
}

export async function saveGuestSettings(form: FormData) {
  return act(form, 'settings.change', async ({ c, slug, form: f }) => {
    await c.publishService.updateSettings(slug, { showUnreviewed: f.get('showUnreviewed') === 'on', showScores: f.get('showScores') === 'on' });
    return { saved: 'settings' };
  });
}
