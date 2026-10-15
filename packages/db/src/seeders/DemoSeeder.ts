import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import { ENGINE_VERSION, buildDemoDataset, contentSnapshot, demoUuid, pairingScore, type DemoDataset } from '@wine-match/core';
import { DishEntity, MembershipEntity, PairingEntity, PublishedVersionEntity, RestaurantEntity, UserEntity, WineEntity, type PublishedSnapshot } from '../entities';

/**
 * Loads the Halka demo restaurant (same data and ids as DATA_SOURCE=memory).
 * Idempotent: if the restaurant already exists it only fills the Polish translations that are still missing
 * (spec 2026-10-15-bilingual-content, R9) and changes nothing else.
 */
export class DemoSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const data = buildDemoDataset({ ids: 'uuid' });
    const { restaurant, dishes, wines, pairings, users } = data;
    if (await em.count(RestaurantEntity, { slug: restaurant.slug })) {
      await fillTranslations(em, data);
      return;
    }

    const r = em.create(RestaurantEntity, {
      id: restaurant.id, slug: restaurant.slug, name: restaurant.name, tagline: restaurant.tagline,
      address: restaurant.address, city: restaurant.city, currency: restaurant.currency,
      wineDirector: restaurant.wineDirector, settings: { showUnreviewed: true, showScores: true }, status: 'active',
      contentLocale: restaurant.contentLocale, translations: restaurant.translations,
      publishedAt: restaurant.publishedAt ? new Date(restaurant.publishedAt) : null
    });

    const dishRows = new Map(dishes.map((d, i) => [d.id, em.create(DishEntity, {
      id: d.id, restaurant: r, name: d.name, description: d.description, category: d.category, price: d.price,
      status: d.status, sortOrder: i, translations: d.translations, profile: { ...d.profile, draftedBy: d.profile.source === 'draft' ? 'rules-1.0' : null, confirmedAt: null }
    })]));

    const wineRows = new Map(wines.map((w, i) => [w.id, em.create(WineEntity, {
      id: w.id, restaurant: r, producer: w.producer, name: w.name, vintage: w.vintage === 'NV' ? null : w.vintage,
      region: w.region, country: w.country, grapes: w.grapes, listNumber: w.listNumber ?? 101 + i, glassPrice: w.glassPrice,
      glassPourMl: w.glassPour, bottlePrice: w.bottlePrice, bottleSizeMl: w.bottleSize, active: w.active,
      colourHex: w.colour, tastingNote: w.tastingNote, translations: w.translations, profile: { ...w.profile, source: 'confirmed' }
    })]));

    for (const p of pairings) {
      const dish = dishes.find((d) => d.id === p.dishId)!;
      const wine = wines.find((w) => w.id === p.wineId)!;
      em.create(PairingEntity, {
        id: p.id, restaurant: r, dish: dishRows.get(p.dishId)!, wine: wineRows.get(p.wineId)!, status: p.status,
        role: p.role, rank: p.rank, comment: p.comment, commentTranslations: p.commentTranslations, modelScore: p.modelScore,
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
      snapshot: snapshotOf(data)
    });
    await em.flush();
  }
}

/** Version 1 of the demo as guests see it: the decided pairings and the translations. */
function snapshotOf({ restaurant, dishes, wines, pairings }: DemoDataset): PublishedSnapshot {
  return {
    pairings: pairings.filter((p) => p.status !== 'suggested').map((p) => ({
      id: p.id, dishId: p.dishId, wineId: p.wineId, status: p.status as 'approved' | 'modified' | 'rejected', role: p.role, rank: p.rank,
      comment: p.comment, commentTranslations: p.commentTranslations, modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy, updatedAt: p.updatedAt
    })),
    content: contentSnapshot(restaurant, dishes, wines)
  };
}

const empty = (t: object | null | undefined) => !t || Object.keys(t).length === 0;

/**
 * A database seeded before translations existed: add the demo's translations where a row has none (a translation
 * someone already changed is kept), and give the demo's own version 1 its translations (an operator command on demo
 * data only; published versions of real restaurants are never touched).
 */
async function fillTranslations(em: EntityManager, data: DemoDataset): Promise<void> {
  const r = await em.findOneOrFail(RestaurantEntity, { slug: data.restaurant.slug });
  if (r.id !== data.restaurant.id) return;
  if (empty(r.translations)) r.translations = data.restaurant.translations;
  const dishes = await em.find(DishEntity, { restaurant: r.id, id: { $in: data.dishes.map((d) => d.id) } });
  for (const d of dishes) if (empty(d.translations)) d.translations = data.dishes.find((x) => x.id === d.id)!.translations;
  const wines = await em.find(WineEntity, { restaurant: r.id, id: { $in: data.wines.map((w) => w.id) } });
  for (const w of wines) if (empty(w.translations)) w.translations = data.wines.find((x) => x.id === w.id)!.translations;
  const pairings = await em.find(PairingEntity, { restaurant: r.id, id: { $in: data.pairings.map((p) => p.id) } });
  for (const p of pairings) {
    const demo = data.pairings.find((x) => x.id === p.id)!;
    // only a note that is still the demo's own gets the demo's translation
    if (empty(p.commentTranslations) && p.comment === demo.comment && !empty(demo.commentTranslations)) p.commentTranslations = demo.commentTranslations;
  }
  const v1 = await em.findOne(PublishedVersionEntity, { id: demoUuid('published_version_1'), restaurant: r.id });
  if (v1 && !v1.snapshot.content) {
    const decided = new Map(data.pairings.map((p) => [p.id, p.commentTranslations]));
    v1.snapshot = {
      pairings: v1.snapshot.pairings.map((p) => ({ ...p, commentTranslations: p.commentTranslations ?? decided.get(p.id) ?? {} })),
      content: contentSnapshot(data.restaurant, data.dishes, data.wines)
    };
  }
  await em.flush();
}
