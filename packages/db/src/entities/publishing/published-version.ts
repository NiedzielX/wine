import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import type { PublishedSnapshot } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/** The snapshot type lives in core (spec 2026-11-04-panel-completion, F1): one shape for every data store and the seeder. */
export type { PublishedSnapshot };

/** Immutable. Guests read the latest one; rolling back means pointing at an earlier number. */
export const PublishedVersionEntity = defineEntity({
  name: 'PublishedVersion',
  tableName: 'published_version',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    number: p.integer(),
    snapshot: p.json<PublishedSnapshot>(),
    changesCount: p.integer().default(0),
    publishedBy: p.string(),
    publishedAt: p.datetime()
  },
  uniques: [{ properties: ['restaurant', 'number'] }]
});

export type PublishedVersionRow = InferEntity<typeof PublishedVersionEntity>;
