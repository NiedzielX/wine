import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { DishEntity } from '../catalog/dish';
import { RestaurantEntity } from '../restaurants/restaurant';
import { WineEntity } from '../catalog/wine';

/** Dish ↔ wine with the sommelier's decision. One row per (dish, wine). */
export const PairingEntity = defineEntity({
  name: 'Pairing',
  tableName: 'pairing',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    dish: () => p.manyToOne(DishEntity),
    wine: () => p.manyToOne(WineEntity),
    status: p.enum(['suggested', 'approved', 'modified', 'rejected'] as const).default('suggested'),
    role: p.enum(['primary', 'alternative', 'best_value'] as const).nullable(),
    rank: p.integer().columnType('smallint').nullable(),
    comment: p.string().length(140).nullable(),
    modelScore: p.integer().columnType('smallint'),
    factors: p.json<Array<{ rule: string; delta: number }>>().nullable(),
    engineVersion: p.string().length(40),
    source: p.enum(['engine', 'sommelier'] as const),
    dirty: p.boolean().default(false),
    updatedBy: p.string(),
    version: p.integer().version(),
    /** set by the application (its clock is the one in the audit trail), so no automatic onUpdate hook */
    updatedAt: p.datetime().onCreate(() => new Date())
  },
  uniques: [{ properties: ['dish', 'wine'] }],
  indexes: [
    { properties: ['restaurant', 'status'] },
    {
      name: 'pairing_one_primary_per_dish',
      expression: "create unique index pairing_one_primary_per_dish on pairing (dish_id) where role = 'primary' and status in ('approved', 'modified')"
    }
  ]
});

export type PairingRow = InferEntity<typeof PairingEntity>;
