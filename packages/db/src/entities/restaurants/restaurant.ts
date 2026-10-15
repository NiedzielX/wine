import { defineEntity, p, type InferEntity } from '@mikro-orm/postgresql';
import type { RestaurantSettings } from '@wine-match/core';

export const RestaurantEntity = defineEntity({
  name: 'Restaurant',
  tableName: 'restaurant',
  properties: {
    id: p.uuid().primary(),
    slug: p.string().length(40).unique(),
    name: p.string(),
    tagline: p.string().default(''),
    address: p.string().default(''),
    city: p.string().default(''),
    currency: p.string().length(3).default('PLN'),
    wineDirector: p.string(),
    settings: p.json<RestaurantSettings>(),
    status: p.enum(['onboarding', 'active', 'paused', 'archived'] as const).default('onboarding'),
    publishedAt: p.datetime().nullable(),
    externalRefs: p.json<Record<string, string>>().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p.datetime().onCreate(() => new Date()).onUpdate(() => new Date())
  }
});

export type RestaurantRow = InferEntity<typeof RestaurantEntity>;
