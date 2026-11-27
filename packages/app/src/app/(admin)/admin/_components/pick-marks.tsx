import type { PicksState } from '@wine-match/core';
import { Badge } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';
import { ActionButton } from './action-form';
import { setRestaurantPick } from '../[slug]/picks-actions';

/**
 * What the dashboard shows about a wine's restaurant pick (spec 2026-11-18-restaurant-picks, R17): a marked wine is a
 * pick; a change nobody has published yet is shown as waiting, so nobody reads the label as live. Pure on the set the
 * page read from `PicksService`.
 */
export type PickMark = 'none' | 'live' | 'waiting' | 'inactive' | 'removed';

export function pickMarks(state: PicksState): (wineId: string) => PickMark {
  const marked = new Map(state.picks.map((p) => [p.wineId, p]));
  const removed = new Set(state.removed.map((r) => r.wineId));
  return (wineId) => {
    const p = marked.get(wineId);
    if (p) return !p.active ? 'inactive' : p.published ? 'live' : 'waiting';
    return removed.has(wineId) ? 'removed' : 'none';
  };
}

/** A neutral badge, no seal and no brand colour of the sommelier (U3); nothing for a wine that is not a pick. */
export function PickBadge({ mark, t }: { mark: PickMark; t: Dictionary }) {
  const b = t.admin.badges;
  if (mark === 'live' || mark === 'inactive') return <Badge variant="outline">{b.pick}</Badge>;
  if (mark === 'waiting') return <Badge variant="outline" className="border-dashed">{b.pickWaiting}</Badge>;
  if (mark === 'removed') return <Badge variant="outline" className="border-dashed text-muted-foreground">{b.pickRemoved}</Badge>;
  return null;
}

/**
 * The toggle of A4, A5 and A27: a form post of `setRestaurantPick`. Disabled (never only hidden) for a role without
 * `picks.edit`, when the five places are used, and for a wine that is hidden from guests; the server refuses each of
 * those anyway. The wine's name is read out after the button text (`sr-only`).
 */
export function PickToggle({ slug, back, wineId, wineLabel, mark, state, canEdit, active, t }: {
  slug: string; back: string; wineId: string; wineLabel: string; mark: PickMark; state: PicksState; canEdit: boolean; active: boolean; t: Dictionary;
}) {
  const on = mark === 'none' || mark === 'removed';
  const full = on && state.picks.length >= state.max;
  const m = t.admin.picks;
  return (
    <ActionButton
      action={setRestaurantPick}
      fields={{ slug, back, wineId, on: String(on), expectedVersion: state.version }}
      variant="ghost"
      disabled={!canEdit || full || (on && !active)}
      title={!canEdit ? m.readOnly : full ? m.full : on && !active ? m.showFirst : undefined}
    >
      {on ? m.mark : m.unmark}<span className="sr-only"> {wineLabel}</span>
    </ActionButton>
  );
}
