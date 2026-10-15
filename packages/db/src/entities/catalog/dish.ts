import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/** Taste profile, embedded in the dish table as profile_* columns (1:1, always loaded with the dish). */
export const DishProfileEmbeddable = defineEntity({
  name: 'DishProfile',
  embeddable: true,
  properties: {
    intensity: p.integer().columnType('smallint'),
    fat: p.integer().columnType('smallint'),
    salt: p.integer().columnType('smallint'),
    sweetness: p.integer().columnType('smallint'),
    acidity: p.integer().columnType('smallint'),
    spice: p.integer().columnType('smallint'),
    umami: p.integer().columnType('smallint'),
    smoke: p.integer().columnType('smallint'),
    creaminess: p.integer().columnType('smallint'),
    protein: p.enum(['beef', 'game', 'poultry', 'pork', 'fish', 'shellfish', 'vegetable', 'mushroom', 'dairy', 'dessert'] as const),
    cooking: p.enum(['raw', 'cured', 'poached', 'seared', 'roasted', 'grilled', 'braised', 'fried', 'baked', 'none'] as const),
    source: p.enum(['draft', 'confirmed'] as const).default('draft'),
    draftedBy: p.string().nullable(),
    confirmedAt: p.datetime().nullable()
  }
});

export const DishEntity = defineEntity({
  name: 'Dish',
  tableName: 'dish',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    name: p.string(),
    description: p.text().default(''),
    category: p.string().length(40),
    price: p.decimal('number').precision(10).scale(2),
    status: p.enum(['draft', 'published', 'hidden'] as const).default('draft'),
    sortOrder: p.integer().default(0),
    profile: () => p.embedded(DishProfileEmbeddable).prefix('profile_'),
    externalRef: p.string().nullable(),
    deletedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date())
  },
  indexes: [{ properties: ['restaurant', 'status'] }]
});

export type DishRow = InferEntity<typeof DishEntity>;
