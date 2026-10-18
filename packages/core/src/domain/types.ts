/** Shared domain types. Mirrors docs/DATA_MODEL.md. */
import type { CommentTranslations, DishTranslations, RestaurantTranslations, WineTranslations } from '../i18n/content';
import type { Locale } from '../i18n/locale';

export type Level = 0 | 1 | 2 | 3 | 4 | 5;

export type ProteinType =
  | 'beef' | 'game' | 'poultry' | 'pork' | 'fish' | 'shellfish'
  | 'vegetable' | 'mushroom' | 'dairy' | 'dessert';

export type CookingMethod =
  | 'raw' | 'cured' | 'poached' | 'seared' | 'roasted' | 'grilled'
  | 'braised' | 'fried' | 'baked' | 'none';

export type WineStyle = 'sparkling' | 'white' | 'rose' | 'orange' | 'red' | 'sweet';

export type DishCategory = 'Starters' | 'Mains' | 'Desserts';

export type EntityStatus = 'published' | 'draft' | 'hidden';

export interface DishProfile {
  intensity: Level;
  fat: Level;
  salt: Level;
  sweetness: Level;
  acidity: Level;
  spice: Level;
  umami: Level;
  smoke: Level;
  creaminess: Level;
  protein: ProteinType;
  cooking: CookingMethod;
  /** Who produced the profile: imported draft or confirmed by staff. */
  source: 'draft' | 'confirmed';
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  category: DishCategory;
  price: number;
  status: EntityStatus;
  profile: DishProfile;
  /** name and description in other languages (spec 2026-10-15-bilingual-content); `{}` = base fields only */
  translations: DishTranslations;
}

export interface WineProfile {
  sweetness: Level;
  acidity: Level;
  tannin: Level;
  body: Level;
  /** ABV in percent */
  alcohol: number;
  fruitiness: Level;
  oak: Level;
  aromatic: Level;
  freshness: Level;
  style: WineStyle;
  /** true for wines outside classic expectations (orange, PIWI grapes, lesser-known regions) */
  adventurous: boolean;
}

export interface Wine {
  id: string;
  producer: string;
  name: string;
  vintage: number | 'NV';
  region: string;
  country: string;
  grapes: string[];
  /** Glass price in PLN, null when sold by the bottle only */
  glassPrice: number | null;
  /** Glass pour in ml (75 ml for sweet wines) */
  glassPour: number;
  bottlePrice: number;
  /** Bottle size in ml */
  bottleSize: number;
  active: boolean;
  /** Position on the printed wine list ("List no."), shown to the waiter */
  listNumber?: number;
  /** Hex colour used for the glass swatch */
  colour: string;
  tastingNote: string;
  profile: WineProfile;
  /** tasting note, region and country in other languages; the wine's and producer's names are never translated */
  translations: WineTranslations;
}

export type PairingStatus = 'suggested' | 'approved' | 'modified' | 'rejected';
export type PairingRole = 'primary' | 'alternative' | 'best_value';

export interface Pairing {
  id: string;
  dishId: string;
  wineId: string;
  status: PairingStatus;
  role: PairingRole | null;
  /** Manual rank set by the sommelier (1 = first); null means ordered by score */
  rank: number | null;
  comment: string | null;
  /** the note in other languages (the base note is `comment`) */
  commentTranslations: CommentTranslations;
  /** Engine score at generation time */
  modelScore: number;
  source: 'engine' | 'sommelier';
  updatedBy: string;
  updatedAt: string;
  /** true when changed since the last publish */
  dirty: boolean;
  /** Optimistic-lock counter, incremented by the data store on every change */
  version?: number;
}

/**
 * The signals of the sommelier's opportunities (spec 2026-10-16-sommelier-opportunities). All five names exist from the
 * first phase so the database check constraint never has to change; S4 and S5 arrive in later phases.
 */
export const OPPORTUNITY_RULES = ['dish_no_primary', 'ordered_not_reviewed', 'glass_match_unpaired', 'wine_unpaired', 'shown_rarely_chosen'] as const;
export type OpportunityRule = (typeof OPPORTUNITY_RULES)[number];

/** An ignored opportunity ("Ignore"): hidden until `expiresAt`. Keyed by the opportunity's subject, see `opportunityKey`. */
export interface OpportunityDismissal {
  id: string;
  key: string;
  rule: OpportunityRule;
  /** the dish and wine the opportunity named when it was ignored (plain ids: the row outlives a deleted dish or wine) */
  dishId: string | null;
  wineId: string | null;
  dismissedBy: string;
  dismissedById: string | null;
  dismissedAt: string;
  expiresAt: string;
}

export interface RestaurantSettings {
  /** fill empty places with engine picks that the sommelier has not reviewed */
  showUnreviewed: boolean;
  /** show match percentages to guests */
  showScores: boolean;
}

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettings = { showUnreviewed: true, showScores: true };

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  address: string;
  city: string;
  currency: 'PLN';
  wineDirector: string;
  publishedAt: string | null;
  settings?: RestaurantSettings;
  /** the language of the base content fields (dish names, notes, tagline, city) */
  contentLocale: Locale;
  /** tagline and city in other languages */
  translations: RestaurantTranslations;
}

export interface GuestPreferences {
  serving: 'any' | 'glass' | 'bottle';
  styles: WineStyle[];
  maxPrice: number | null;
  weight: 'any' | 'lighter' | 'fuller';
  mood: 'any' | 'classic' | 'adventurous';
}

export const DEFAULT_PREFS: GuestPreferences = {
  serving: 'any',
  styles: [],
  maxPrice: null,
  weight: 'any',
  mood: 'any'
};

/**
 * The catalogue of guest usage events written to `guest_interaction` (spec 2026-10-15-guest-usage-events). The names
 * and their `props` keys are read by the KPI dashboard (E04): add names, never rename one. The same list is in
 * docs/SCREEN_SPECIFICATION.md (Analytics).
 */
export const GUEST_EVENT_NAMES = [
  'guest_session_started', 'menu_viewed', 'recommendations_viewed', 'table_recommendation_viewed', 'wine_viewed', 'wine_selected', 'staff_lookup',
  /** a view of "How we pick your wine" (G12, spec 2026-10-16-how-it-works-explanations, Q9) */
  'explainer_viewed',
  /** the waiter's whole-table lookup (G11, spec 2026-10-16-whole-table-waiter-path, R13) */
  'staff_table_lookup'
] as const;
export type GuestEventName = (typeof GUEST_EVENT_NAMES)[number];

/** A stored usage event as read back. `props` is untyped on read: old or damaged rows are possible. */
export interface GuestInteraction {
  sessionId: string;
  name: GuestEventName;
  dishId: string | null;
  wineId: string | null;
  props: Record<string, unknown>;
  engineVersion: string | null;
  createdAt: string;
}

/* ---------- recommendation codes (spec 2026-10-16-recommendation-code) ---------- */

/** Who received the code: the guest on G8, or the waiter on the staff table result (E08). */
export const CODE_SOURCES = ['guest', 'staff'] as const;
export type CodeSource = (typeof CODE_SOURCES)[number];
/** `dish`: one published dish; `table`: 2–12 published dishes; `direct`: a wine opened without a dish (R5). */
export const CODE_CONTEXTS = ['dish', 'table', 'direct'] as const;
export type CodeContext = (typeof CODE_CONTEXTS)[number];
/** How the wine was placed for the dish when the guest chose it (Q18), as `tier` in the API and the usage events. */
export const CODE_TIERS = ['sommelier_primary', 'sommelier', 'engine'] as const;
export type CodeTier = (typeof CODE_TIERS)[number];
export type CodeServing = 'glass' | 'bottle';

/**
 * One recommendation: a code issued for one choice (R5). Validated values only: no IP, user agent, table number or
 * text typed by anyone. `dishIds` is sorted and without duplicates (1 for `dish`, 2–12 for `table`, none for `direct`);
 * `tier` only for a guest's dish choice. `serviceDay` is `YYYY-MM-DD`, times are ISO strings.
 */
export interface RecommendationCodeRecord {
  code: string;
  serviceDay: string;
  sessionId: string;
  source: CodeSource;
  context: CodeContext;
  wineId: string;
  dishIds: string[];
  serving: CodeServing;
  menuVersion: string | null;
  tier: CodeTier | null;
  engineVersion: string;
  issuedAt: string;
  confirmedAt: string | null;
}

/** Results per (dish, wine, context) for E04 and E10; `ordered` = staff-confirmed ∪ POS-matched (R10). */
export interface PairCodeStats {
  dishId: string;
  wineId: string;
  context: CodeContext;
  issued: number;
  staffConfirmed: number;
  posMatched: number;
  ordered: number;
}

/** Totals for a period of service days, both inclusive (Q12). */
export interface CodeSummary {
  period: { from: string; to: string };
  issued: number;
  staffConfirmed: number;
  posMatched: number;
  ordered: number;
  unmatchedPosCodes: number;
}
