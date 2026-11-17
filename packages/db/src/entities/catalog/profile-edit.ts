import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * Append-only audit trail of edits to taste profiles (spec 2026-11-04-panel-completion, R5). `subjectId` is a plain
 * column, not a foreign key: the history must survive the deletion of the dish or wine (like `sommelier_decision`).
 */
export const ProfileEditEntity = defineEntity({
  name: 'ProfileEdit',
  tableName: 'profile_edit',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    kind: p.enum(['dish', 'wine'] as const),
    subjectId: p.uuid(),
    actor: p.string(),
    /** the signed-in user (a plain column: history outlives accounts too) */
    actorId: p.uuid().nullable(),
    before: p.json<Record<string, unknown>>(),
    after: p.json<Record<string, unknown>>(),
    /** when the edit was made (the application clock, not the insert time) */
    createdAt: p.datetime()
  },
  indexes: [{ properties: ['restaurant', 'createdAt'] }]
});

export type ProfileEditRow = InferEntity<typeof ProfileEditEntity>;
