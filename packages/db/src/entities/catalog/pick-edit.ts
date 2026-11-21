import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * Append-only history of the restaurant's picks (spec 2026-11-18-restaurant-picks, R3): who marked or unmarked which wine
 * and when, with the set before and after. `wineId` is a plain column, not a foreign key: the history outlives the wine.
 * The flag is `enabled`, not `on` (a reserved word in SQL).
 */
export const PickEditEntity = defineEntity({
  name: 'PickEdit',
  tableName: 'pick_edit',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    wineId: p.uuid(),
    /** true = marked, false = unmarked */
    enabled: p.boolean(),
    actor: p.string(),
    /** the signed-in user (a plain column: history outlives accounts too) */
    actorId: p.uuid().nullable(),
    /** the sorted wine ids of the working set before and after the change */
    before: p.json<string[]>(),
    after: p.json<string[]>(),
    /** when the change was made (the application clock, not the insert time) */
    at: p.datetime()
  },
  indexes: [{ properties: ['restaurant', 'at'] }]
});

export type PickEditRow = InferEntity<typeof PickEditEntity>;
