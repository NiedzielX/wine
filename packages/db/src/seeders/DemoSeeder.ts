import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import { ENGINE_VERSION, buildDemoDataset, demoUuid, pairingScore } from '@wine-match/core';
import { DishEntity, MembershipEntity, PairingEntity, PublishedVersionEntity, RestaurantEntity, UserEntity, WineEntity } from '../entities';

/**
 * Loads the Halka demo restaurant (same data and ids as DATA_SOURCE=memory).
 * Idempotent: does nothing if the restaurant already exists.
 */
export class DemoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const { restaurant, dishes, wines, pairings, users } = buildDemoDataset({ ids: 'uuid' });
    if (await em.count(RestaurantEntity, { slug: restaurant.slug })) return;

    const r = em.create(RestaurantEntity, {
      id: restaurant.id, slug: restaurant.slug, name: restaurant.name, tagline: restaurant.tagline,
      address: restaurant.address, city: restaurant.city, currency: restaurant.currency,
      wineDirector: restaurant.wineDirector, settings: { showUnreviewed: true, showScores: true }, status: 'active',
      publishedAt: restaurant.publishedAt ? new Date(restaurant.publishedAt) : null
    });

    const dishRows = new Map(dishes.map((d, i) => [d.id, em.create(DishEntity, {
      id: d.id, restaurant: r, name: d.name, description: d.description, category: d.category, price: d.price,
      status: d.status, sortOrder: i, profile: { ...d.profile, draftedBy: d.profile.source === 'draft' ? 'rules-1.0' : null, confirmedAt: null }
    })]));

    const wineRows = new Map(wines.map((w, i) => [w.id, em.create(WineEntity, {
      id: w.id, restaurant: r, producer: w.producer, name: w.name, vintage: w.vintage === 'NV' ? null : w.vintage,
      region: w.region, country: w.country, grapes: w.grapes, listNumber: w.listNumber ?? 101 + i, glassPrice: w.glassPrice,
      glassPourMl: w.glassPour, bottlePrice: w.bottlePrice, bottleSizeMl: w.bottleSize, active: w.active,
      colourHex: w.colour, tastingNote: w.tastingNote, profile: { ...w.profile, source: 'confirmed' }
    })]));

    for (const p of pairings) {
      const dish = dishes.find((d) => d.id === p.dishId)!;
      const wine = wines.find((w) => w.id === p.wineId)!;
      em.create(PairingEntity, {
        id: p.id, restaurant: r, dish: dishRows.get(p.dishId)!, wine: wineRows.get(p.wineId)!, status: p.status,
        role: p.role, rank: p.rank, comment: p.comment, modelScore: p.modelScore,
        factors: pairingScore(dish, wine).factors.map(({ rule, delta }) => ({ rule, delta })),
        engineVersion: ENGINE_VERSION, source: p.source, dirty: false, updatedBy: p.updatedBy
      });
    }

    // demo accounts (DEMO DATA ONLY: the password is public, see core/src/demo/users.ts)
    for (const u of users) {
      const user = em.create(UserEntity, { id: u.id, email: u.email, name: u.name, passwordHash: u.passwordHash });
      em.create(MembershipEntity, { id: demoUuid(`m_${u.key}`), user, restaurant: r, role: u.role });
    }

    // version 1: the state the demo restaurant was published in (guests read the latest version)
    em.create(PublishedVersionEntity, {
      id: demoUuid('published_version_1'), restaurant: r, number: 1, changesCount: 0, publishedBy: restaurant.wineDirector,
      publishedAt: new Date(restaurant.publishedAt ?? '1970-01-01T00:00:00.000Z'),
      snapshot: {
        pairings: pairings.filter((p) => p.status !== 'suggested').map((p) => ({
          id: p.id, dishId: p.dishId, wineId: p.wineId, status: p.status as 'approved' | 'modified' | 'rejected', role: p.role, rank: p.rank,
          comment: p.comment, modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy, updatedAt: p.updatedAt
        }))
      }
    });
    await em.flush();
  }
}
