'use server';

import { act, localeFields, str, translationsOrInvalid, version } from '@/server/action-runner';

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

/** The note and, when the form has them, its Polish and English versions (`comment_pl`, `comment_en`). */
export async function savePairingNote(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => {
    if (f.has('comment_pl') || f.has('comment_en')) {
      const translations = Object.fromEntries((['pl', 'en'] as const).filter((l) => f.has(`comment_${l}`)).map((l) => [l, str(f, `comment_${l}`)]));
      return translationsOrInvalid(async () => { await c.sommelierService.setNote(slug, str(f, 'pairingId'), { comment: str(f, 'comment'), translations }, actor, version(f)); return { saved: 'note' }; });
    }
    await c.sommelierService.setComment(slug, str(f, 'pairingId'), str(f, 'comment'), actor, version(f));
    return { saved: 'note' };
  });
}

/** A3 "Translations": the dish's name and description in Polish and English (spec 2026-10-15-bilingual-content, R6). */
export async function saveDishTranslations(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }) => translationsOrInvalid(async () => {
    await c.translationService.setDishTranslations(slug, str(f, 'dishId'), localeFields(f, ['name', 'description']), actor, str(f, 'version') || undefined);
    return { saved: 'translations' };
  }));
}

/** A5 "Translations": tasting note, region and country in Polish and English. */
export async function saveWineTranslations(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }) => translationsOrInvalid(async () => {
    await c.translationService.setWineTranslations(slug, str(f, 'wineId'), localeFields(f, ['tastingNote', 'region', 'country']), actor, str(f, 'version') || undefined);
    return { saved: 'translations' };
  }));
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

/** Opportunities (spec 2026-10-16-sommelier-opportunities, F2): "Add to suggestions" puts the wine in the review queue; guests see nothing until it is approved and published. */
export async function addOpportunitySuggestion(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => {
    await c.sommelierService.addSuggestion(slug, { dishId: str(f, 'dishId'), wineId: str(f, 'wineId') }, actor);
    return { saved: 'suggestion_added' };
  });
}

/** "Ignore": hides the opportunity for DISMISS_DAYS; a key that is no longer a candidate is `opportunity_stale`. */
export async function dismissOpportunity(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.opportunityService.dismiss(slug, str(f, 'key'), actor); return { saved: 'opportunity_dismissed' }; });
}

/** "Restore": the ignored opportunity shows again right away. */
export async function restoreOpportunity(form: FormData) {
  return act(form, 'pairings.decide', async ({ c, slug, actor, form: f }) => { await c.opportunityService.restore(slug, str(f, 'key'), actor); return { saved: 'opportunity_restored' }; });
}

export async function saveGuestSettings(form: FormData) {
  return act(form, 'settings.change', async ({ c, slug, form: f }) => {
    await c.publishService.updateSettings(slug, { showUnreviewed: f.get('showUnreviewed') === 'on', showScores: f.get('showScores') === 'on' });
    return { saved: 'settings' };
  });
}
