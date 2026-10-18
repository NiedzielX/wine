import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { CODE_CONTEXTS, CODE_SOURCES, CODE_TIERS } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';
import { WineEntity } from '../catalog/wine';

/**
 * A recommendation code issued for one choice (spec 2026-10-16-recommendation-code, data model). No personal data:
 * `session_id` is the anonymous `sid`. `dish_ids` is a sorted jsonb array without a foreign key, so dishes of a
 * withdrawn menu stay readable by id. A code is unique per restaurant and service day; a choice has one code.
 */
export const RecommendationCodeEntity = defineEntity({
  name: 'RecommendationCode',
  tableName: 'recommendation_code',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    serviceDay: p.date(),
    code: p.string().length(4),
    sessionId: p.uuid(),
    source: p.enum([...CODE_SOURCES]),
    context: p.enum([...CODE_CONTEXTS]),
    wine: () => p.manyToOne(WineEntity),
    dishIds: p.json<string[]>(),
    serving: p.enum(['glass', 'bottle'] as const),
    menuVersion: p.datetime().nullable(),
    /** how the wine was placed for the dish (Q18); null for table, direct and staff */
    tier: p.enum([...CODE_TIERS]).nullable(),
    engineVersion: p.string().length(40),
    issuedAt: p.datetime(),
    confirmedAt: p.datetime().nullable(),
    /** the `actor` of the confirmation (`staff_view`) */
    confirmedBy: p.string().length(20).nullable()
  },
  uniques: [{ properties: ['restaurant', 'serviceDay', 'code'] }],
  indexes: [
    { properties: ['restaurant', 'issuedAt'] },
    {
      // one code per choice (R3); its prefix also serves the per-session count (R13). jsonb has a btree operator class.
      name: 'recommendation_code_choice_unique',
      expression: 'create unique index recommendation_code_choice_unique on recommendation_code (restaurant_id, service_day, session_id, wine_id, serving, dish_ids)'
    }
  ]
});

export type RecommendationCodeRow = InferEntity<typeof RecommendationCodeEntity>;
