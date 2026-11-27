import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';
import { WineEntity } from './wine';

/**
 * A wine the restaurant marked as its pick (spec 2026-11-18-restaurant-picks, R1): the working set, which reaches guests
 * only through a publish (the snapshot of schema 3). One row per (restaurant, wine). Wines are deleted softly
 * (`deleted_at`), so the foreign key never cascades in practice: every query joins the wine and skips the deleted ones,
 * and the limit counts the picks of inactive wines too (a reactivated wine must not push the active ones past the cap).
 */
export const RestaurantPickEntity = defineEntity({
  name: 'RestaurantPick',
  tableName: 'restaurant_pick',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    wine: () => p.manyToOne(WineEntity).deleteRule('cascade'),
    /** when the wine was marked (the application clock) */
    setAt: p.datetime(),
    setBy: p.string(),
    /** the signed-in user (a plain column: it outlives the account) */
    setById: p.uuid().nullable()
  },
  uniques: [{ properties: ['restaurant', 'wine'] }],
  indexes: [{ properties: ['wine'] }]
});

export type RestaurantPickRow = InferEntity<typeof RestaurantPickEntity>;
