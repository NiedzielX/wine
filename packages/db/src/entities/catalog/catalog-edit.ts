import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * Append-only audit trail of edits to the fields of dishes and wines (spec 2026-11-16-catalog-field-editing, R10).
 * `subjectId` is a plain column, not a foreign key: the history must survive the deletion of the dish or wine (like
 * `sommelier_decision` and `profile_edit`). `before` and `after` hold only the changed fields; `identity` marks a change
 * of the name (dish) or of producer, name or vintage (wine), after which the pairings need a second look (R15).
 */
export const CatalogEditEntity = defineEntity({
  name: 'CatalogEdit',
  tableName: 'catalog_edit',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    kind: p.enum(['dish', 'wine'] as const),
    subjectId: p.uuid(),
    action: p.enum(['create', 'update', 'hidden', 'shown'] as const),
    actor: p.string(),
    /** the signed-in user (a plain column: history outlives accounts too) */
    actorId: p.uuid().nullable(),
    before: p.json<Record<string, unknown>>().nullable(),
    after: p.json<Record<string, unknown>>(),
    identity: p.boolean().default(false),
    /** when the edit was made (the application clock, not the insert time) */
    createdAt: p.datetime()
  },
  indexes: [{ properties: ['restaurant', 'kind', 'subjectId', 'createdAt'] }]
});

export type CatalogEditRow = InferEntity<typeof CatalogEditEntity>;
