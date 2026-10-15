import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import { RestaurantEntity } from '../restaurants/restaurant';

/** Anonymous guest analytics events (no personal data). Partition monthly in production. */
export const GuestInteractionEntity = defineEntity({
  name: 'GuestInteraction',
  tableName: 'guest_interaction',
  properties: {
    id: p.bigint('number').primary().autoincrement(),
    restaurant: () => p.manyToOne(RestaurantEntity),
    sessionId: p.uuid(),
    name: p.string().length(60),
    dishId: p.uuid().nullable(),
    wineId: p.uuid().nullable(),
    props: p.json<Record<string, unknown>>().nullable(),
    engineVersion: p.string().length(40).nullable(),
    createdAt: p.datetime().onCreate(() => new Date())
  },
  indexes: [{ properties: ['restaurant', 'createdAt'] }, { properties: ['restaurant', 'name'] }]
});

export type GuestInteractionRow = InferEntity<typeof GuestInteractionEntity>;
