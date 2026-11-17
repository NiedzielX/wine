import type { Dish, Pairing, PairingRole, PairingStatus, Restaurant, Wine, WineStyle } from '../../domain/types';
import type { DecisionRecord } from '../../ports/repositories';
import { pairingScore } from '../../engine/scoring';
import type { Locale } from '../../i18n/locale';
import type { Repositories } from '../../ports/repositories';
import { orderReviewed } from '../pairings/pairing-rules';
import { countProfileChanges } from '../publishing/snapshot';
import { countContentChanges, localizeComment, localizeDish, localizeRestaurant, localizeWine } from '../../i18n/content';
import type { CatalogEditRecord } from '../../ports/repositories';
import { dishFieldsOf, dishFieldsVersion, staleTranslationLocales, wineFieldsOf, wineFieldsVersion } from '../catalog/catalog-edit-rules';

export type AdminServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository' | 'catalogEditRepository'>;

/**
 * Read models for the restaurant / sommelier dashboard. Read-only: writes arrive with Phase 3.
 * `locale` only changes the language of the engine's explanations (`why`); scores and order never depend on it.
 */

const isApproved = (p: Pairing) => p.status === 'approved' || p.status === 'modified';
const ci = (s: string) => s.toLocaleLowerCase('en');
/** A sommelier-decided pairing with no decision newer than the last rename of its dish or wine (R15): derived, no column. */
const needsCheck = (p: Pairing, rename: Pick<CatalogEditRecord, 'at'>) => isApproved(p) && p.updatedAt <= rename.at;
const pairNeedsCheck = (p: Pairing, renames: Map<string, Pick<CatalogEditRecord, 'at'>>) => {
  const dish = renames.get(`dish:${p.dishId}`);
  const wine = renames.get(`wine:${p.wineId}`);
  return (dish !== undefined && needsCheck(p, dish)) || (wine !== undefined && needsCheck(p, wine));
};

export interface RestaurantOverview {
  restaurant: Restaurant;
  dishes: { total: number; published: number; draft: number; hidden: number; draftProfiles: number };
  wines: { total: number; active: number; inactive: number; byGlass: number };
  pairings: { approved: number; suggested: number; rejected: number };
  /** published dishes that have a sommelier-approved primary pairing */
  primaryCoverage: { withPrimary: number; published: number; without: Dish[] };
  /** dishes with at least one approved pairing, out of dishes that have any pairing */
  review: { reviewedDishes: number; dishesWithPairings: number; suggestions: number };
  /** unpublished work: pairings with a decision since the last publish, draft dishes and changed translations */
  unpublishedChanges: number;
}

export interface AdminMenuRow { dish: Dish; approved: number; suggested: number; hasPrimary: boolean }
export interface MenuFilter { q?: string; category?: string }
export interface MenuView { restaurant: Restaurant; rows: AdminMenuRow[]; total: number; categories: string[] }

export interface ScoredWine { wine: Wine; score: number; why: string }
export interface ScoredDish { dish: Dish; score: number; why: string }

/** What A3 and A5 show about the last edit of the fields (spec 2026-11-16-catalog-field-editing, R10, R11, R15). */
export interface CatalogEditInfo {
  /** the fingerprint of the editable fields: the hidden `version` of the form, the `ETag` of the API */
  fieldsVersion: string;
  /** the newest audit row (who and when); the page shows the name only to roles with `audit.view` */
  lastEdit: { actor: string; at: string } | null;
  /** languages whose translation guests still read from the last publish although the last edit changed its field (R11, N2) */
  staleLocales: Locale[];
  /** approved or modified pairings that have no decision newer than the last rename (R15) */
  pairsToCheck: number;
}

export interface DishDetail extends CatalogEditInfo {
  restaurant: Restaurant;
  /** in the panel's language */
  dish: Dish;
  /** as stored: the base fields and every translation (the translation form) */
  source: Dish;
  topMatches: ScoredWine[];
  pairings: { approved: number; suggested: number; rejected: number; hasPrimary: boolean };
}

export interface AdminWineRow { wine: Wine; approvedPairings: number }
export interface WineFilter { q?: string; style?: WineStyle }
export interface WineListView { restaurant: Restaurant; rows: AdminWineRow[]; total: number; active: number; byGlass: number }

export interface WineDetail extends CatalogEditInfo {
  restaurant: Restaurant;
  wine: Wine;
  /** as stored (the translation form) */
  source: Wine;
  bestDishes: ScoredDish[];
  approvedFor: Array<{ dish: Dish; role: PairingRole | null; status: Pairing['status']; checkAfterRename: boolean }>;
}

export interface ReviewItem { pairing: Pairing; wine: Wine; why: string }
export interface ReviewGroup { dish: Dish; hasPrimary: boolean; items: ReviewItem[] }
/** A dish or wine renamed since its pairings were last decided: "Name changed, check the pairs" (R15). */
export interface RenamedItem { kind: 'dish' | 'wine'; id: string; name: string; pairs: number; at: string }
export interface ReviewQueue {
  restaurant: Restaurant;
  renamed: RenamedItem[];
  progress: { reviewedDishes: number; dishesWithPairings: number; suggestions: number };
  groups: ReviewGroup[];
}

export interface WorkbenchPairing extends Pairing {
  wine: Wine | null;
  /** the sommelier's note in the panel's language (`comment` / `commentTranslations` stay as stored, for the form) */
  note: string | null;
  /** the sommelier's note, or the engine's explanation */
  why: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export interface PairingWorkbench {
  restaurant: Restaurant;
  dish: Dish;
  /** approved and modified pairings in guest order */
  approved: WorkbenchPairing[];
  suggested: WorkbenchPairing[];
  rejected: WorkbenchPairing[];
  /** active wines that can still be added by hand, best engine score first (includes engine suggestions) */
  addable: ScoredWine[];
  /** recent decisions on this dish, newest first, with the wine's name */
  history: Array<DecisionRecord & { wineName: string }>;
  /** all dishes with their pairing counts, for the side list */
  menu: AdminMenuRow[];
  /** true when this dish has changes that guests do not see yet */
  hasUnpublishedChanges: boolean;
}

export type SetupStepKey = 'details' | 'menu' | 'wines' | 'profiles' | 'pairings' | 'publish' | 'qr';
/**
 * `title` and `detail` are English. `state` names which detail applies and `values` holds its numbers, so the
 * dashboard can say the same in the user's language (spec 2026-10-15-polish-language, R13).
 */
export interface SetupStep { key: SetupStepKey; title: string; detail: string; done: boolean; state: SetupStepState; values: Record<string, number> }
export type SetupStepState =
  | 'details' | 'menu_done' | 'menu_empty' | 'wines_done' | 'wines_empty'
  | 'profiles_no_menu' | 'profiles_done' | 'profiles_drafts' | 'pairings'
  | 'publish_never' | 'publish_pending' | 'publish_done' | 'qr_done' | 'qr_wait';
export interface SetupView { restaurant: Restaurant; /** as stored (the content form) */ source: Restaurant; steps: SetupStep[]; published: boolean }

const TOP = 5;

export class AdminService {
  private readonly repos: AdminServiceDeps;

  constructor(deps: AdminServiceDeps) {
    this.repos = deps;
  }

  /**
   * The current data; with `locale` the restaurant, dishes and wines are shown in that language (spec
   * 2026-10-15-bilingual-content, R3: the panel shows the current translations, not the published ones). `raw` is as stored.
   */
  private async load(slug: string, locale?: Locale) {
    const restaurant = await this.repos.restaurantRepository.findBySlug(slug);
    if (!restaurant) return null;
    const [dishes, wines, pairings] = await Promise.all([
      this.repos.dishRepository.listByRestaurant(restaurant.id),
      this.repos.wineRepository.listByRestaurant(restaurant.id),
      this.repos.pairingRepository.listByRestaurant(restaurant.id)
    ]);
    const raw = { restaurant, dishes, wines };
    if (!locale) return { restaurant, dishes, wines, pairings, raw };
    return {
      restaurant: localizeRestaurant(restaurant, locale), dishes: dishes.map((x) => localizeDish(x, locale)), wines: wines.map((x) => localizeWine(x, locale)),
      pairings, raw
    };
  }

  async overview(slug: string, locale?: Locale): Promise<RestaurantOverview | null> {
    const d = await this.load(slug, locale);
    if (!d) return null;
    const { restaurant, dishes, wines, pairings } = d;
    const [pairingChanges, publishedContent, effective] = await Promise.all([
      this.repos.publishRepository.pendingPairingChanges(restaurant.id),
      this.repos.publishRepository.publishedContent(restaurant.id),
      this.repos.publishRepository.effective(restaurant.id)
    ]);
    // the same parts as PublishService.preview: decisions, translations, profiles and menu composition (+ drafts below)
    const pending = pairingChanges + countContentChanges(d.raw, publishedContent) + countProfileChanges(d.raw, effective);
    const published = dishes.filter((x) => x.status === 'published');
    const primaryIds = new Set(pairings.filter((p) => isApproved(p) && p.role === 'primary').map((p) => p.dishId));
    const pairedIds = new Set(pairings.map((p) => p.dishId));
    const reviewedIds = new Set(pairings.filter(isApproved).map((p) => p.dishId));
    return {
      restaurant,
      dishes: {
        total: dishes.length, published: published.length,
        draft: dishes.filter((x) => x.status === 'draft').length, hidden: dishes.filter((x) => x.status === 'hidden').length,
        draftProfiles: dishes.filter((x) => x.status !== 'hidden' && x.profile.source === 'draft').length
      },
      wines: {
        total: wines.length, active: wines.filter((w) => w.active).length, inactive: wines.filter((w) => !w.active).length,
        byGlass: wines.filter((w) => w.active && w.glassPrice !== null).length
      },
      pairings: { approved: pairings.filter(isApproved).length, suggested: pairings.filter((p) => p.status === 'suggested').length, rejected: pairings.filter((p) => p.status === 'rejected').length },
      primaryCoverage: { withPrimary: published.filter((x) => primaryIds.has(x.id)).length, published: published.length, without: published.filter((x) => !primaryIds.has(x.id)) },
      review: { reviewedDishes: [...pairedIds].filter((id) => reviewedIds.has(id)).length, dishesWithPairings: pairedIds.size, suggestions: pairings.filter((p) => p.status === 'suggested').length },
      unpublishedChanges: pending + dishes.filter((x) => x.status === 'draft').length
    };
  }

  async menu(slug: string, filter: MenuFilter = {}, locale?: Locale): Promise<MenuView | null> {
    const d = await this.load(slug, locale);
    if (!d) return null;
    const term = ci((filter.q ?? '').trim());
    const rows = d.dishes
      .filter((x) => (!filter.category || x.category === filter.category) && (!term || ci(`${x.name} ${x.description}`).includes(term)))
      .map((dish): AdminMenuRow => {
        const ps = d.pairings.filter((p) => p.dishId === dish.id);
        return { dish, approved: ps.filter(isApproved).length, suggested: ps.filter((p) => p.status === 'suggested').length, hasPrimary: ps.some((p) => isApproved(p) && p.role === 'primary') };
      });
    return { restaurant: d.restaurant, rows, total: d.dishes.length, categories: [...new Set(d.dishes.map((x) => x.category))] };
  }

  /** The onboarding checklist of the Setup screen: what is done and what is next. */
  async setup(slug: string, locale?: Locale): Promise<SetupView | null> {
    const o = await this.overview(slug, locale);
    const source = await this.repos.restaurantRepository.findBySlug(slug);
    if (!o) return null;
    const last = await this.repos.publishRepository.latest(o.restaurant.id);
    const { dishes, wines, pairings, review } = o;
    const live = !!last && o.dishes.published > 0;
    const steps: SetupStep[] = [
      { key: 'details', title: 'Restaurant details', done: true, state: 'details', values: {}, detail: `${o.restaurant.name}, ${o.restaurant.address}, ${o.restaurant.city}. Guest address name: ${o.restaurant.slug}.` },
      dishes.total > 0
        ? { key: 'menu', title: 'Import your menu', done: true, state: 'menu_done', values: { dishes: dishes.total }, detail: `${dishes.total} dishes on the menu.` }
        : { key: 'menu', title: 'Import your menu', done: false, state: 'menu_empty', values: {}, detail: 'Upload a CSV, Excel or PDF file.' },
      wines.total > 0
        ? { key: 'wines', title: 'Import your wine list', done: true, state: 'wines_done', values: { active: wines.active, byGlass: wines.byGlass }, detail: `${wines.active} wines on the list, ${wines.byGlass} by the glass.` }
        : { key: 'wines', title: 'Import your wine list', done: false, state: 'wines_empty', values: {}, detail: 'Upload a CSV, Excel or PDF file.' },
      dishes.total === 0
        ? { key: 'profiles', title: 'Check the taste profiles', done: false, state: 'profiles_no_menu', values: {}, detail: 'Import a menu first.' }
        : dishes.draftProfiles === 0
          ? { key: 'profiles', title: 'Check the taste profiles', done: true, state: 'profiles_done', values: {}, detail: 'Every dish profile is confirmed.' }
          : { key: 'profiles', title: 'Check the taste profiles', done: false, state: 'profiles_drafts', values: { drafts: dishes.draftProfiles, dishes: dishes.total }, detail: `${dishes.draftProfiles} of ${dishes.total} dish profiles are still drafts.` },
      { key: 'pairings', title: 'Review the pairings', done: pairings.approved > 0 && review.suggestions === 0, state: 'pairings', values: { approved: pairings.approved, suggestions: review.suggestions }, detail: `${pairings.approved} approved, ${review.suggestions} suggestions to review.` },
      !last
        ? { key: 'publish', title: 'Publish', done: false, state: 'publish_never', values: {}, detail: 'Not published yet.' }
        : o.unpublishedChanges > 0
          ? { key: 'publish', title: 'Publish', done: false, state: 'publish_pending', values: { changes: o.unpublishedChanges }, detail: `${o.unpublishedChanges} unpublished changes.` }
          : { key: 'publish', title: 'Publish', done: live, state: 'publish_done', values: {}, detail: 'Guests see the latest version.' },
      { key: 'qr', title: 'Print the QR code', done: live, state: live ? 'qr_done' : 'qr_wait', values: {}, detail: live ? 'Put the code on your tables.' : 'Publish first, then print the code.' }
    ];
    return { restaurant: o.restaurant, source: source ?? o.restaurant, steps, published: live };
  }

  /** Current pairings (including unpublished changes), optionally for one dish and/or one status. */
  async listPairings(slug: string, filter: { dishId?: string; status?: PairingStatus } = {}): Promise<{ restaurant: Restaurant; pairings: Pairing[] } | null> {
    const d = await this.load(slug);
    if (!d) return null;
    return { restaurant: d.restaurant, pairings: d.pairings.filter((p) => (!filter.dishId || p.dishId === filter.dishId) && (!filter.status || p.status === filter.status)) };
  }

  async pairingWorkbench(slug: string, dishId: string, locale: Locale = 'en'): Promise<PairingWorkbench | null> {
    const d = await this.load(slug, locale);
    const dish = d?.dishes.find((x) => x.id === dishId);
    if (!d || !dish) return null;
    const wineById = new Map(d.wines.map((w) => [w.id, w]));
    const mine = d.pairings.filter((p) => p.dishId === dish.id);
    const withWine = (p: Pairing, i: number, list: Pairing[]): WorkbenchPairing => {
      const wine = wineById.get(p.wineId) ?? null;
      const pinned = p.role === 'primary';
      const note = localizeComment(p, locale);
      return {
        ...p, wine, note, why: note ?? (wine ? pairingScore(dish, wine, locale).why : ''),
        canMoveUp: !pinned && i > 0 && list[i - 1].role !== 'primary',
        canMoveDown: !pinned && i < list.length - 1
      };
    };
    const approvedList = orderReviewed(mine);
    const byScore = (a: Pairing, b: Pairing) => b.modelScore - a.modelScore || a.id.localeCompare(b.id);
    const taken = new Set(mine.filter((p) => p.status !== 'suggested').map((p) => p.wineId));
    const history = (await this.repos.pairingRepository.listDecisions(d.restaurant.id, { dishId: dish.id }, 15))
      .map((x) => ({ ...x, wineName: wineById.get(x.wineId)?.name ?? 'Removed wine' }));
    return {
      restaurant: d.restaurant, dish,
      approved: approvedList.map(withWine),
      suggested: mine.filter((p) => p.status === 'suggested').sort(byScore).map(withWine),
      rejected: mine.filter((p) => p.status === 'rejected').sort(byScore).map(withWine),
      addable: d.wines.filter((w) => w.active && !taken.has(w.id)).map((wine) => ({ wine, ...pairingScore(dish, wine, locale) }))
        .sort((a, b) => b.score - a.score || a.wine.id.localeCompare(b.wine.id)).map(({ wine, score, why }) => ({ wine, score, why })),
      history,
      menu: (await this.menu(slug, {}, locale))!.rows,
      hasUnpublishedChanges: mine.some((p) => p.dirty)
    };
  }

  /**
   * The newest identity edit of every dish and wine (R15), by `kind:id`. A pairing needs a second look when it is sommelier-decided
   * and its dish OR its wine was renamed after the decision.
   */
  private async identityEdits(restaurantId: string): Promise<Map<string, CatalogEditRecord>> {
    const latest = new Map<string, CatalogEditRecord>();
    for (const e of await this.repos.catalogEditRepository.list(restaurantId, { identityOnly: true })) {
      const key = `${e.kind}:${e.subjectId}`;
      if (!latest.has(key)) latest.set(key, e);
    }
    return latest;
  }

  /** The audit-derived facts A3 and A5 show (R10, R11, R15). `pairs` are the pairings of this dish or wine. */
  private async catalogInfo(restaurantId: string, kind: 'dish' | 'wine', subjectId: string, fieldsVersion: string, pairs: Pairing[], renames: Map<string, CatalogEditRecord>): Promise<CatalogEditInfo> {
    const [last, published] = await Promise.all([this.repos.catalogEditRepository.latest(restaurantId, kind, subjectId), this.repos.publishRepository.latest(restaurantId)]);
    let staleLocales: Locale[] = [];
    if (last && (!published || last.at > published.publishedAt)) {
      const content = await this.repos.publishRepository.publishedContent(restaurantId);
      staleLocales = staleTranslationLocales(kind, Object.keys(last.after), (kind === 'dish' ? content.dishes : content.wines).get(subjectId));
    }
    return { fieldsVersion, lastEdit: last ? { actor: last.actor, at: last.at } : null, staleLocales, pairsToCheck: pairs.filter((p) => pairNeedsCheck(p, renames)).length };
  }

  async dishDetail(slug: string, dishId: string, locale: Locale = 'en'): Promise<DishDetail | null> {
    const d = await this.load(slug, locale);
    const dish = d?.dishes.find((x) => x.id === dishId);
    if (!d || !dish) return null;
    const topMatches = d.wines
      .filter((w) => w.active)
      .map((wine) => ({ wine, ...pairingScore(dish, wine, locale) }))
      .sort((a, b) => b.score - a.score || a.wine.id.localeCompare(b.wine.id))
      .slice(0, TOP)
      .map(({ wine, score, why }) => ({ wine, score, why }));
    const ps = d.pairings.filter((p) => p.dishId === dish.id);
    const source = d.raw.dishes.find((x) => x.id === dish.id) ?? dish;
    const info = await this.catalogInfo(d.restaurant.id, 'dish', dish.id, dishFieldsVersion(dishFieldsOf(source)), ps, await this.identityEdits(d.restaurant.id));
    return {
      ...info,
      restaurant: d.restaurant, dish, source, topMatches,
      pairings: { approved: ps.filter(isApproved).length, suggested: ps.filter((p) => p.status === 'suggested').length, rejected: ps.filter((p) => p.status === 'rejected').length, hasPrimary: ps.some((p) => isApproved(p) && p.role === 'primary') }
    };
  }

  async wines(slug: string, filter: WineFilter = {}, locale?: Locale): Promise<WineListView | null> {
    const d = await this.load(slug, locale);
    if (!d) return null;
    const term = ci((filter.q ?? '').trim());
    const rows = d.wines
      .filter((w) => (!filter.style || w.profile.style === filter.style) && (!term || ci(`${w.producer} ${w.name} ${w.region} ${w.grapes.join(' ')}`).includes(term)))
      .map((wine): AdminWineRow => ({ wine, approvedPairings: d.pairings.filter((p) => p.wineId === wine.id && isApproved(p)).length }));
    return {
      restaurant: d.restaurant, rows, total: d.wines.length,
      active: d.wines.filter((w) => w.active).length, byGlass: d.wines.filter((w) => w.active && w.glassPrice !== null).length
    };
  }

  async wineDetail(slug: string, wineId: string, locale: Locale = 'en'): Promise<WineDetail | null> {
    const d = await this.load(slug, locale);
    const wine = d?.wines.find((w) => w.id === wineId);
    if (!d || !wine) return null;
    const bestDishes = d.dishes
      .filter((x) => x.status !== 'hidden')
      .map((dish) => ({ dish, ...pairingScore(dish, wine, locale) }))
      .sort((a, b) => b.score - a.score || a.dish.id.localeCompare(b.dish.id))
      .slice(0, TOP)
      .map(({ dish, score, why }) => ({ dish, score, why }));
    const mine = d.pairings.filter((p) => p.wineId === wine.id);
    const source = d.raw.wines.find((x) => x.id === wine.id) ?? wine;
    const renames = await this.identityEdits(d.restaurant.id);
    const info = await this.catalogInfo(d.restaurant.id, 'wine', wine.id, wineFieldsVersion(wineFieldsOf(source)), mine, renames);
    const approvedFor = mine
      .filter((p) => isApproved(p))
      .flatMap((p) => {
        const dish = d.dishes.find((x) => x.id === p.dishId);
        return dish ? [{ dish, role: p.role, status: p.status, checkAfterRename: pairNeedsCheck(p, renames) }] : [];
      });
    return { ...info, restaurant: d.restaurant, wine, source, bestDishes, approvedFor };
  }

  async reviewQueue(slug: string, locale: Locale = 'en'): Promise<ReviewQueue | null> {
    const d = await this.load(slug, locale);
    if (!d) return null;
    const wineById = new Map(d.wines.map((w) => [w.id, w]));
    const groups: ReviewGroup[] = [];
    for (const dish of d.dishes) {
      const items = d.pairings
        .filter((p) => p.dishId === dish.id && p.status === 'suggested')
        .sort((a, b) => b.modelScore - a.modelScore || a.id.localeCompare(b.id))
        .flatMap((pairing) => {
          const wine = wineById.get(pairing.wineId);
          return wine ? [{ pairing, wine, why: pairingScore(dish, wine, locale).why }] : [];
        });
      if (items.length === 0) continue;
      groups.push({ dish, hasPrimary: d.pairings.some((p) => p.dishId === dish.id && isApproved(p) && p.role === 'primary'), items });
    }
    const pairedIds = new Set(d.pairings.map((p) => p.dishId));
    const reviewedIds = new Set(d.pairings.filter(isApproved).map((p) => p.dishId));
    const renamed: RenamedItem[] = [];
    const seen = new Set<string>();
    for (const e of await this.repos.catalogEditRepository.list(d.restaurant.id, { identityOnly: true })) {
      const key = `${e.kind}:${e.subjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = e.kind === 'dish' ? d.dishes.find((x) => x.id === e.subjectId) : d.wines.find((x) => x.id === e.subjectId);
      if (!item) continue;
      const pairs = d.pairings.filter((p) => (e.kind === 'dish' ? p.dishId : p.wineId) === e.subjectId && needsCheck(p, e)).length;
      if (pairs > 0) renamed.push({ kind: e.kind, id: e.subjectId, name: 'producer' in item ? `${item.producer} ${item.name}` : item.name, pairs, at: e.at });
    }
    return {
      restaurant: d.restaurant, renamed,
      progress: { reviewedDishes: [...pairedIds].filter((id) => reviewedIds.has(id)).length, dishesWithPairings: pairedIds.size, suggestions: d.pairings.filter((p) => p.status === 'suggested').length },
      groups
    };
  }
}
