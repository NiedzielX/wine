import { WINDOW_DAYS, type Dish, type Locale, type OpportunityItem, type Wine } from '@wine-match/core';
import { Badge } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';
import { addOpportunitySuggestion, approvePairing, dismissOpportunity } from '../[slug]/actions';
import { ActionButton } from './action-form';
import { zl } from './format';

const wineName = (w: Wine | null) => (w ? `${w.producer} ${w.name}` : '');

/** The sentence of one opportunity, built from its evidence in the dashboard's language (spec R2, R9). */
export function opportunitySentence(item: OpportunityItem, dish: Dish, t: Dictionary, locale: Locale): string {
  const s = t.admin.opportunities.sentences;
  const e = item.evidence;
  switch (e.rule) {
    case 'dish_no_primary':
      return e.reason === 'primary_hidden' ? s.primary_hidden(wineName(item.wine)) : s[e.reason]();
    case 'glass_match_unpaired':
      return s.glass_match_unpaired(wineName(item.wine), e.score, zl(e.glassPrice, locale));
    case 'wine_unpaired':
      return s.wine_unpaired(wineName(item.wine), dish.name, e.score);
    case 'ordered_not_reviewed':
      return s.ordered_not_reviewed(wineName(item.wine), e.orders, WINDOW_DAYS);
  }
}

/**
 * The opportunities of one dish (spec 2026-10-16-sommelier-opportunities, F2): a row with the "Opportunity" badge, one
 * sentence with numbers and the actions, as plain form posts (no JavaScript). Used on A6 (the dish's card) and in A14.
 * S5 "Approve" posts the existing `approvePairing` with the pairing's version (`expectedVersion`), as on A6 and A7.
 * Roles without `pairings.decide` see the rows without buttons; every action checks the permission again.
 */
export function OpportunityList({ items, dish, slug, back, decide, t, locale }: {
  items: OpportunityItem[]; dish: Dish; slug: string; back: string; decide: boolean; t: Dictionary; locale: Locale;
}) {
  const m = t.admin.opportunities;
  return (
    <ul className="grid">
      {items.map((o) => (
        <li key={o.key} data-opportunity={o.rule} className="grid gap-3 border-b px-6 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <Badge className="mb-1.5 border-transparent bg-brass-soft text-brass">{m.badge}</Badge>
            <p className="text-sm">{opportunitySentence(o, dish, t, locale)}</p>
          </div>
          {decide && (
            <div className="flex flex-wrap gap-1.5">
              {o.action === 'approve' && o.pairingId && (
                <ActionButton action={approvePairing} fields={{ slug, back, pairingId: o.pairingId, version: o.pairingVersion }}>{m.approve}</ActionButton>
              )}
              {o.action === 'add_suggestion' && o.wineId && (
                <ActionButton action={addOpportunitySuggestion} fields={{ slug, back, dishId: o.dishId, wineId: o.wineId }}>{m.add}</ActionButton>
              )}
              <ActionButton action={dismissOpportunity} fields={{ slug, back, key: o.key }} variant="ghost">{m.ignore}</ActionButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
