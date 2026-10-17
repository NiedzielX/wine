import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { OPPORTUNITY_RULES } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * An ignored opportunity (spec 2026-10-16-sommelier-opportunities, R6): hidden until `expires_at`.
 * `dish_id` and `wine_id` are plain columns, not foreign keys: like the decision history, the row outlives a deleted
 * dish or wine. `rule` is checked against all five signal names from the start, so later phases need no migration.
 */
export const OpportunityDismissalEntity = defineEntity({
  name: 'OpportunityDismissal',
  tableName: 'opportunity_dismissal',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    key: p.text().fieldName('opportunity_key'),
    rule: p.enum([...OPPORTUNITY_RULES]),
    dishId: p.uuid().nullable(),
    wineId: p.uuid().nullable(),
    dismissedBy: p.text(),
    /** the signed-in user; a plain column like `sommelier_decision.actor_id` */
    dismissedById: p.uuid().nullable(),
    dismissedAt: p.datetime(),
    expiresAt: p.datetime()
  },
  uniques: [{ properties: ['restaurant', 'key'] }]
});

export type OpportunityDismissalRow = InferEntity<typeof OpportunityDismissalEntity>;
