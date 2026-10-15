import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/** The pairing decisions of one published version, as guests see them. */
export interface PublishedSnapshot {
  pairings: Array<{
    id: string; dishId: string; wineId: string; status: 'approved' | 'modified' | 'rejected';
    role: 'primary' | 'alternative' | 'best_value' | null; rank: number | null; comment: string | null;
    modelScore: number; source: 'engine' | 'sommelier'; updatedBy: string; updatedAt: string;
  }>;
}

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
