import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/**
 * Append-only audit trail of sommelier decisions on pairings.
 * `pairingId` is a plain column, not a foreign key: the history must survive the deletion of the pairing.
 */
export const SommelierDecisionEntity = defineEntity({
  name: 'SommelierDecision',
  tableName: 'sommelier_decision',
  properties: {
    id: p.uuid().primary(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    pairingId: p.uuid(),
    dishId: p.uuid(),
    wineId: p.uuid(),
    actor: p.string(),
    /** the signed-in user (a plain column, like pairingId: history outlives accounts too); null for older rows */
    actorId: p.uuid().nullable(),
    action: p.enum(['approve', 'modify', 'reject', 'restore', 'set_role', 'reorder', 'comment', 'create', 'delete'] as const),
    before: p.json<Record<string, unknown>>().nullable(),
    after: p.json<Record<string, unknown>>().nullable(),
    /** when the decision was made (the application clock, not the insert time) */
    createdAt: p.datetime()
  },
  indexes: [{ properties: ['restaurant', 'createdAt'] }, { properties: ['pairingId'] }, { properties: ['dishId'] }]
});

export type SommelierDecisionRow = InferEntity<typeof SommelierDecisionEntity>;
