import type { DecisionRecord, Dish, ImportJob, Level, Pairing, Restaurant, Wine } from '@wine-match/core';
import { DEFAULT_RESTAURANT_SETTINGS } from '@wine-match/core';
import type { DishRow, ImportJobRow, PairingRow, PublishedSnapshot, RestaurantRow, SommelierDecisionRow, WineRow } from './entities';

const lvl = (n: number) => Math.max(0, Math.min(5, n)) as Level;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toRestaurant(r: RestaurantRow): Restaurant {
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, address: r.address, city: r.city,
    currency: r.currency as Restaurant['currency'], wineDirector: r.wineDirector,
    publishedAt: iso(r.publishedAt), settings: { ...DEFAULT_RESTAURANT_SETTINGS, ...r.settings }
  };
}

export function toDish(d: DishRow): Dish {
  const p = d.profile;
  return {
    id: d.id, name: d.name, description: d.description, category: d.category as Dish['category'],
    price: Number(d.price), status: d.status,
    profile: {
      intensity: lvl(p.intensity), fat: lvl(p.fat), salt: lvl(p.salt), sweetness: lvl(p.sweetness), acidity: lvl(p.acidity),
      spice: lvl(p.spice), umami: lvl(p.umami), smoke: lvl(p.smoke), creaminess: lvl(p.creaminess),
      protein: p.protein, cooking: p.cooking, source: p.source
    }
  };
}

export function toWine(w: WineRow): Wine {
  const p = w.profile;
  return {
    id: w.id, producer: w.producer, name: w.name, vintage: w.vintage ?? 'NV', region: w.region, country: w.country,
    grapes: [...w.grapes], glassPrice: w.glassPrice === null || w.glassPrice === undefined ? null : Number(w.glassPrice),
    glassPour: w.glassPourMl, bottlePrice: Number(w.bottlePrice), bottleSize: w.bottleSizeMl, active: w.active,
    listNumber: w.listNumber ?? undefined, colour: w.colourHex, tastingNote: w.tastingNote,
    profile: {
      sweetness: lvl(p.sweetness), acidity: lvl(p.acidity), tannin: lvl(p.tannin), body: lvl(p.body), alcohol: Number(p.alcohol),
      fruitiness: lvl(p.fruitiness), oak: lvl(p.oak), aromatic: lvl(p.aromatic), freshness: lvl(p.freshness),
      style: p.style, adventurous: p.adventurous
    }
  };
}

export function toPairing(p: PairingRow): Pairing {
  return {
    id: p.id, dishId: p.dish.id, wineId: p.wine.id, status: p.status, role: p.role ?? null, rank: p.rank ?? null,
    comment: p.comment ?? null, modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy,
    updatedAt: p.updatedAt.toISOString(), dirty: p.dirty, version: p.version
  };
}

export function toPublishedPairing(p: PublishedSnapshot['pairings'][number]): Pairing {
  return { ...p, dirty: false };
}

export function toDecision(d: SommelierDecisionRow): DecisionRecord {
  return {
    id: d.id, pairingId: d.pairingId, dishId: d.dishId, wineId: d.wineId, actor: d.actor, actorId: d.actorId ?? null, action: d.action,
    before: d.before ?? null, after: d.after ?? null, at: d.createdAt.toISOString()
  };
}

export function toImportJob(j: ImportJobRow): ImportJob {
  return {
    id: j.id, restaurantId: j.restaurant.id, kind: j.kind as ImportJob['kind'], fileName: j.fileName, fileType: j.fileType, fileSize: j.fileSize,
    status: j.status, parser: j.parser ?? null, rows: j.rows ?? [], notes: j.notes ?? [], error: j.error ?? null, createdBy: j.createdBy,
    createdAt: j.createdAt.toISOString(), confirmedAt: j.confirmedAt ? j.confirmedAt.toISOString() : null, result: j.result ?? null
  };
}
