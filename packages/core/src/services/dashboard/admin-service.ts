import type { Dish, Pairing, PairingRole, PairingStatus, Restaurant, Wine, WineStyle } from '../../domain/types';
import type { DecisionRecord } from '../../ports/repositories';
import { pairingScore } from '../../engine/scoring';
import type { Locale } from '../../i18n/locale';
import type { Repositories } from '../../ports/repositories';
import { orderReviewed } from '../pairings/pairing-rules';
import { countContentChanges, localizeComment, localizeDish, localizeRestaurant, localizeWine } from '../../i18n/content';

export type AdminServiceDeps = Pick<Repositories, 'restaurantRepository' | 'dishRepository' | 'wineRepository' | 'pairingRepository' | 'publishRepository'>;

/**
 * Read models for the restaurant / sommelier dashboard. Read-only: writes arrive with Phase 3.
 * `locale` only changes the language of the engine's explanations (`why`); scores and order never depend on it.
 */

const isApproved = (p: Pairing) => p.status === 'approved' || p.status === 'modified';
const ci = (s: string) => s.toLocaleLowerCase('en');

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

export interface DishDetail {
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

export interface WineDetail {
  restaurant: Restaurant;
  wine: Wine;
  /** as stored (the translation form) */
  source: Wine;
  bestDishes: ScoredDish[];
  approvedFor: Array<{ dish: Dish; role: PairingRole | null; status: Pairing['status'] }>;
}

export interface ReviewItem { pairing: Pairing; wine: Wine; why: string }
export interface ReviewGroup { dish: Dish; hasPrimary: boolean; items: ReviewItem[] }
export interface ReviewQueue {
  restaurant: Restaurant;
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
    const [pairingChanges, publishedContent] = await Promise.all([
      this.repos.publishRepository.pendingPairingChanges(restaurant.id),
      this.repos.publishRepository.publishedContent(restaurant.id)
    ]);
    const pending = pairingChanges + countContentChanges(d.raw, publishedContent);
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
    return {
      restaurant: d.restaurant, dish, source: d.raw.dishes.find((x) => x.id === dish.id) ?? dish, topMatches,
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
    const approvedFor = d.pairings
      .filter((p) => p.wineId === wine.id && isApproved(p))
      .flatMap((p) => {
        const dish = d.dishes.find((x) => x.id === p.dishId);
        return dish ? [{ dish, role: p.role, status: p.status }] : [];
      });
    return { restaurant: d.restaurant, wine, source: d.raw.wines.find((x) => x.id === wine.id) ?? wine, bestDishes, approvedFor };
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
    return {
      restaurant: d.restaurant,
      progress: { reviewedDishes: [...pairedIds].filter((id) => reviewedIds.has(id)).length, dishesWithPairings: pairedIds.size, suggestions: d.pairings.filter((p) => p.status === 'suggested').length },
      groups
    };
  }
}
