/** Shared domain types. Mirrors docs/DATA_MODEL.md. */

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
