import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import type { CommentTranslations, ContentSnapshot } from '@wine-match/core';
import { RestaurantEntity } from '../restaurants/restaurant';

/** The pairing decisions of one published version, as guests see them. */
export interface PublishedSnapshot {
  pairings: Array<{
    id: string; dishId: string; wineId: string; status: 'approved' | 'modified' | 'rejected';
    role: 'primary' | 'alternative' | 'best_value' | null; rank: number | null; comment: string | null;
    /** absent in versions published before 2026-10-15 (read as `{}`) */
    commentTranslations?: CommentTranslations;
    modelScore: number; source: 'engine' | 'sommelier'; updatedBy: string; updatedAt: string;
  }>;
  /** translations guests see (spec 2026-10-15-bilingual-content, R4); absent in older versions (read as `{}`) */
  content?: ContentSnapshot;
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
