import type {
  CodeContext, CodeServing, CodeSource, CodeTier, DecisionRecord, Dish, GuestEventName, GuestInteraction, ImportJob, Level, OpportunityDismissal, Pairing,
  RecommendationCodeRecord, Restaurant, Wine
} from '@wine-match/core';
import {
  DEFAULT_RESTAURANT_SETTINGS, DISH_TEXT_FIELDS, RESTAURANT_TEXT_FIELDS, WINE_TEXT_FIELDS, cleanCommentTranslations, cleanTranslations, isLocale
} from '@wine-match/core';
import type { DishRow, GuestInteractionRow, ImportJobRow, OpportunityDismissalRow, PairingRow, PublishedSnapshot, RestaurantRow, SommelierDecisionRow, WineRow } from './entities';

const lvl = (n: number) => Math.max(0, Math.min(5, n)) as Level;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toRestaurant(r: RestaurantRow): Restaurant {
  return {
    id: r.id, slug: r.slug, name: r.name, tagline: r.tagline, address: r.address, city: r.city,
    currency: r.currency as Restaurant['currency'], wineDirector: r.wineDirector,
    publishedAt: iso(r.publishedAt), settings: { ...DEFAULT_RESTAURANT_SETTINGS, ...r.settings },
    contentLocale: isLocale(r.contentLocale) ? r.contentLocale : 'en', translations: cleanTranslations(r.translations, RESTAURANT_TEXT_FIELDS)
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
    },
    translations: cleanTranslations(d.translations, DISH_TEXT_FIELDS)
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
    },
    translations: cleanTranslations(w.translations, WINE_TEXT_FIELDS)
  };
}

export function toPairing(p: PairingRow): Pairing {
  return {
    id: p.id, dishId: p.dish.id, wineId: p.wine.id, status: p.status, role: p.role ?? null, rank: p.rank ?? null,
    comment: p.comment ?? null, commentTranslations: cleanCommentTranslations(p.commentTranslations), modelScore: p.modelScore, source: p.source, updatedBy: p.updatedBy,
    updatedAt: p.updatedAt.toISOString(), dirty: p.dirty, version: p.version
  };
}

export function toPublishedPairing(p: PublishedSnapshot['pairings'][number]): Pairing {
  return { ...p, commentTranslations: cleanCommentTranslations(p.commentTranslations), dirty: false };
}

export function toDecision(d: SommelierDecisionRow): DecisionRecord {
  return {
    id: d.id, pairingId: d.pairingId, dishId: d.dishId, wineId: d.wineId, actor: d.actor, actorId: d.actorId ?? null, action: d.action,
    before: d.before ?? null, after: d.after ?? null, at: d.createdAt.toISOString()
  };
}

export function toOpportunityDismissal(d: OpportunityDismissalRow): OpportunityDismissal {
  return {
    id: d.id, key: d.key, rule: d.rule, dishId: d.dishId ?? null, wineId: d.wineId ?? null, dismissedBy: d.dismissedBy,
    dismissedById: d.dismissedById ?? null, dismissedAt: d.dismissedAt.toISOString(), expiresAt: d.expiresAt.toISOString()
  };
}

export function toGuestInteraction(e: GuestInteractionRow): GuestInteraction {
  return {
    sessionId: e.sessionId, name: e.name as GuestEventName, dishId: e.dishId ?? null, wineId: e.wineId ?? null,
    props: e.props ?? {}, engineVersion: e.engineVersion ?? null, createdAt: e.createdAt.toISOString()
  };
}

export function toImportJob(j: ImportJobRow): ImportJob {
  return {
    id: j.id, restaurantId: j.restaurant.id, kind: j.kind as ImportJob['kind'], fileName: j.fileName, fileType: j.fileType, fileSize: j.fileSize,
    status: j.status, parser: j.parser ?? null, rows: j.rows ?? [], notes: j.notes ?? [], error: j.error ?? null, createdBy: j.createdBy,
    createdAt: j.createdAt.toISOString(), confirmedAt: j.confirmedAt ? j.confirmedAt.toISOString() : null, result: j.result ?? null
  };
}

/** A `recommendation_code` row as the native statements of `PgRecommendationCodeRepository` select it. */
export interface RecommendationCodeSqlRow {
  code: string;
  service_day: string;
  session_id: string;
  source: CodeSource;
  context: CodeContext;
  wine_id: string;
  dish_ids: string[];
  serving: CodeServing;
  menu_version: Date | string | null;
  tier: CodeTier | null;
  engine_version: string;
  issued_at: Date | string;
  confirmed_at: Date | string | null;
}

const instant = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export function toRecommendationCode(r: RecommendationCodeSqlRow): RecommendationCodeRecord {
  return {
    code: r.code, serviceDay: r.service_day, sessionId: r.session_id, source: r.source, context: r.context, wineId: r.wine_id,
    dishIds: [...r.dish_ids], serving: r.serving, menuVersion: instant(r.menu_version), tier: r.tier, engineVersion: r.engine_version,
    issuedAt: new Date(r.issued_at).toISOString(), confirmedAt: instant(r.confirmed_at)
  };
}
