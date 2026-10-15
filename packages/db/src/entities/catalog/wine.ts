import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import type { WineTranslations } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/** Wine profile, embedded in the wine table as profile_* columns. */
export const WineProfileEmbeddable = defineEntity({
  name: 'WineProfile',
  embeddable: true,
  properties: {
    sweetness: p.integer().columnType('smallint'),
    acidity: p.integer().columnType('smallint'),
    tannin: p.integer().columnType('smallint'),
    body: p.integer().columnType('smallint'),
    alcohol: p.decimal('number').precision(3).scale(1),
    fruitiness: p.integer().columnType('smallint'),
    oak: p.integer().columnType('smallint'),
    aromatic: p.integer().columnType('smallint'),
    freshness: p.integer().columnType('smallint'),
    style: p.enum(['sparkling', 'white', 'rose', 'orange', 'red', 'sweet'] as const),
    adventurous: p.boolean().default(false),
    source: p.enum(['grape_defaults', 'catalog', 'confirmed'] as const).default('confirmed')
  }
});

/** A wine as listed by one restaurant: price and availability are local to the restaurant. */
export const WineEntity = defineEntity({
  name: 'Wine',
  tableName: 'wine',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    catalogWineId: p.uuid().nullable(),
    producer: p.string(),
    name: p.string(),
    /** null = non-vintage */
    vintage: p.integer().columnType('smallint').nullable(),
    region: p.string().default(''),
    country: p.string().default(''),
    grapes: p.array(),
    listNumber: p.integer().nullable(),
    glassPrice: p.decimal('number').precision(10).scale(2).nullable(),
    glassPourMl: p.integer().columnType('smallint').default(150),
    bottlePrice: p.decimal('number').precision(10).scale(2),
    bottleSizeMl: p.integer().columnType('smallint').default(750),
    active: p.boolean().default(true),
    colourHex: p.string().length(7),
    tastingNote: p.text().default(''),
    stockQty: p.integer().nullable(),
    profile: () => p.embedded(WineProfileEmbeddable).prefix('profile_'),
    /** tasting note, region and country in other languages (spec 2026-10-15-bilingual-content, R9) */
    translations: p.json<WineTranslations>().defaultRaw(`'{}'`),
    externalRef: p.string().nullable(),
    deletedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date())
  },
  indexes: [{ properties: ['restaurant', 'active'] }]
});

export type WineRow = InferEntity<typeof WineEntity>;
