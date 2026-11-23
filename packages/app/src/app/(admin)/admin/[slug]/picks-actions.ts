'use server';

import { act, str } from '@/server/action-runner';

/**
 * The one server action of the restaurant's picks (spec 2026-11-18-restaurant-picks, R17, A27, A4, A5): a plain form post
 * (no JavaScript), `picks.edit` checked here again for a form post sent directly (owner and general manager only; the Wine
 * Director sees the screen but a forged post is refused), `expectedVersion` is the fingerprint of the set the form was
 * drawn from. The rules (limit of 5, active wines, idempotence, the history row) are `PicksService`'s.
 */
export async function setRestaurantPick(form: FormData) {
  return act(form, 'picks.edit', async ({ c, slug, actor, form: f }) => {
    const on = str(f, 'on') === 'true';
    const r = await c.picksService.set(slug, str(f, 'wineId'), on, actor, { expectedVersion: str(f, 'expectedVersion') || undefined });
    return { saved: r.changed ? (on ? 'pick_marked' : 'pick_unmarked') : 'pick_unchanged' };
  });
}
