import type { DishCategory, DishProfile, Level, ProteinType, WineProfile, WineStyle } from '../domain/types';

/**
 * Import helpers. Deterministic keyword rules produce a FIRST DRAFT of a profile.
 * Drafts are always marked source = 'draft' and must be confirmed by staff.
 * An optional local LLM (see RECOMMENDATION_ENGINE.md, section 8) can replace this step
 * at import time only; it is never called per guest request.
 */

const clamp = (n: number): Level => Math.max(0, Math.min(5, Math.round(n))) as Level;

const PROTEIN_WORDS: Array<[ProteinType, RegExp]> = [
  ['vegetable', /\b(cauliflower|celeriac|cabbage|aubergine|eggplant|squash|beetroot|tofu|mushroom)\s+steak\b/i],
  ['dessert', /\b(tart|cake|sernik|cheesecake|chocolate|ice cream|sorbet|pudding|mousse|panna cotta|crumble)\b/i],
  ['shellfish', /\b(scallop|prawn|shrimp|lobster|crab|oyster|mussel|langoustine)s?\b/i],
  ['fish', /\b(fish|salmon|trout|cod|herring|pike|perch|tuna|halibut|sea bass|turbot|mackerel|zander|sandacz)\b/i],
  ['game', /\b(venison|deer|boar|hare|pheasant|partridge|game)\b/i],
  ['beef', /\b(beef|steak|ribeye|sirloin|tenderloin|tartare|veal|oxtail)\b/i],
  ['pork', /\b(pork|belly|ham|bacon|sausage|kie[lł]basa|schnitzel)\b/i],
  ['poultry', /\b(chicken|duck|goose|turkey|quail|guinea fowl)\b/i],
  ['mushroom', /\b(mushroom|porcini|chanterelle|truffle|morel)s?\b/i],
  ['dairy', /\b(burrata|cheese|ricotta|mozzarella|camembert|goat)\b/i]
];

export function draftDishProfile(name: string, description: string, category: DishCategory): DishProfile {
  const t = `${name} ${description}`.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  let protein: ProteinType = 'vegetable';
  for (const [p, re] of PROTEIN_WORDS) if (has(re)) { protein = p; break; }
  if (category === 'Desserts') protein = protein === 'dairy' ? 'dairy' : 'dessert';

  const cooking: DishProfile['cooking'] =
    has(/\b(tartare|raw|carpaccio|crudo|ceviche)\b/) ? 'raw'
      : has(/\b(cured|smoked salmon|gravlax|pickled herring|herring)\b/) ? 'cured'
        : has(/\b(grill|grilled|charred|bbq|flame)\b/) ? 'grilled'
          : has(/\b(fried|crisp|crackling|schnitzel|pierogi)\b/) ? 'fried'
            : has(/\b(braised|stew|confit|risotto|slow)\b/) ? 'braised'
              : has(/\b(poached|steamed)\b/) ? 'poached'
                : has(/\b(seared|pan-fried)\b/) ? 'seared'
                  : has(/\b(roast|roasted)\b/) ? 'roasted'
                    : has(/\b(baked|tart|cake)\b/) ? 'baked' : 'none';

  const intensityBase: Record<ProteinType, number> = {
    beef: 4, game: 5, pork: 4, poultry: 3, fish: 2, shellfish: 2, mushroom: 3, vegetable: 2, dairy: 2, dessert: 3
  };
  let intensity = intensityBase[protein];
  if (cooking === 'grilled' || cooking === 'braised') intensity += 1;
  if (cooking === 'raw' || cooking === 'poached') intensity -= 1;

  return {
    intensity: clamp(intensity),
    fat: clamp(2 + (has(/\b(butter|cream|belly|marrow|confit|duck|goose|cheese|burrata|aioli|mayo)\b/) ? 2 : 0) + (has(/\bfried|crackling\b/) ? 1 : 0)),
    salt: clamp(2 + (has(/\b(cured|caviar|anchovy|capers|miso|soy|parmesan|aged|bacon|cheese)\b/) ? 2 : 0)),
    sweetness: clamp((protein === 'dessert' ? 4 : 0) + (has(/\b(honey|glaze|cherry|apple|pumpkin|beetroot|quince|plum|caramel)\b/) ? 2 : 0)),
    acidity: clamp(1 + (has(/\b(pickled|lemon|vinegar|sour|citrus|buckthorn|rhubarb|cherry)\b/) ? 2 : 0)),
    spice: clamp(has(/\b(chili|chilli|gochujang|harissa|jalape|curry|sriracha|pepper sauce)\b/) ? 3 : has(/\b(mustard|horseradish|pepper)\b/) ? 1 : 0),
    umami: clamp(1 + (has(/\b(mushroom|porcini|miso|parmesan|aged|soy|dry-aged|tomato|anchovy|jus)\b/) ? 3 : 0)),
    smoke: clamp(has(/\b(smoked|charred|grill|grilled|bbq)\b/) ? 3 : 0),
    creaminess: clamp(has(/\b(cream|creamy|risotto|butter|burrata|purée|puree|beurre)\b/) ? 3 : 1),
    protein,
    cooking,
    source: 'draft'
  };
}

/** Grape defaults used when a wine list row has no tasting data. */
const GRAPE_DEFAULTS: Record<string, Partial<WineProfile>> = {
  'pinot noir': { acidity: 4, tannin: 2, body: 2, fruitiness: 3, oak: 1, style: 'red' },
  gamay: { acidity: 4, tannin: 1, body: 2, fruitiness: 4, style: 'red' },
  syrah: { acidity: 3, tannin: 3, body: 4, fruitiness: 3, style: 'red' },
  'cabernet sauvignon': { acidity: 3, tannin: 4, body: 5, oak: 3, style: 'red' },
  merlot: { acidity: 3, tannin: 3, body: 4, fruitiness: 4, oak: 2, style: 'red' },
  nebbiolo: { acidity: 5, tannin: 5, body: 4, style: 'red' },
  sangiovese: { acidity: 4, tannin: 3, body: 3, style: 'red' },
  tempranillo: { acidity: 3, tannin: 3, body: 4, oak: 3, style: 'red' },
  chardonnay: { acidity: 4, body: 3, oak: 1, style: 'white' },
  riesling: { acidity: 5, body: 1, aromatic: 4, sweetness: 1, style: 'white' },
  'sauvignon blanc': { acidity: 5, body: 2, aromatic: 4, style: 'white' },
  'grüner veltliner': { acidity: 4, body: 2, aromatic: 3, style: 'white' },
  'chenin blanc': { acidity: 5, body: 3, aromatic: 3, style: 'white' },
  solaris: { acidity: 4, body: 2, aromatic: 4, style: 'white' },
  furmint: { acidity: 5, body: 3, style: 'white' }
};

export function draftWineProfile(grape: string, styleHint: string): WineProfile {
  const g = GRAPE_DEFAULTS[grape.trim().toLowerCase()] ?? {};
  const hint = styleHint.toLowerCase();
  const style: WineStyle =
    /spark|champ|cava|cr[eé]mant|prosecco|brut/.test(hint) ? 'sparkling'
      : /ros[eé]/.test(hint) ? 'rose'
        : /orange|amber|skin/.test(hint) ? 'orange'
          : /sweet|dessert|port|tokaj|sauternes|aszú/.test(hint) ? 'sweet'
            : (g.style ?? (/red/.test(hint) ? 'red' : 'white'));
  return {
    sweetness: (style === 'sweet' ? 5 : g.sweetness ?? 0) as Level,
    acidity: (g.acidity ?? 3) as Level,
    tannin: (style === 'red' ? g.tannin ?? 3 : style === 'orange' ? 2 : 0) as Level,
    body: (g.body ?? 3) as Level,
    alcohol: style === 'sweet' ? 12 : 13,
    fruitiness: (g.fruitiness ?? 3) as Level,
    oak: (g.oak ?? 0) as Level,
    aromatic: (g.aromatic ?? 3) as Level,
    freshness: (style === 'sparkling' ? 5 : 3) as Level,
    style,
    adventurous: style === 'orange'
  };
}

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, commas or semicolons). */
export function parseCsv(text: string): string[][] {
  const first = text.split('\n')[0];
  const count = (c: string) => first.split(c).length - 1;
  // the delimiter is whichever of ; , tab appears most in the header line (comma wins ties)
  const delim = count(';') > count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export interface MenuRow { name: string; description: string; category: DishCategory; price: number | null; issues: string[] }
export interface WineRow { producer: string; name: string; vintage: string; region: string; grape: string; style: string; glassPrice: number | null; bottlePrice: number | null; issues: string[] }

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function headerIndex(header: string[], ...names: string[]): number {
  const h = header.map((x) => x.toLowerCase());
  return h.findIndex((x) => names.some((n) => x.includes(n)));
}

export function rowsToMenu(rows: string[][]): MenuRow[] {
  const [header, ...data] = rows;
  const iName = headerIndex(header, 'name', 'dish', 'danie', 'nazwa');
  const iDesc = headerIndex(header, 'desc', 'opis');
  const iCat = headerIndex(header, 'categ', 'kategor', 'section');
  const iPrice = headerIndex(header, 'price', 'cena');
  return data.map((r) => {
    const issues: string[] = [];
    const name = r[iName] ?? '';
    const price = num(r[iPrice]);
    const rawCat = (r[iCat] ?? '').toLowerCase();
    const category: DishCategory = /dess|deser|sweet/.test(rawCat) ? 'Desserts' : /start|przyst|small/.test(rawCat) ? 'Starters' : 'Mains';
    if (!name) issues.push('Missing name');
    if (price === null) issues.push('Missing price');
    if (!rawCat) issues.push('No category, set to Mains');
    return { name, description: r[iDesc] ?? '', category, price, issues };
  });
}

export function rowsToWines(rows: string[][]): WineRow[] {
  const [header, ...data] = rows;
  const g = (r: string[], ...n: string[]) => { const i = headerIndex(header, ...n); return i >= 0 ? r[i] ?? '' : ''; };
  return data.map((r) => {
    const issues: string[] = [];
    const row: WineRow = {
      producer: g(r, 'producer', 'producent'), name: g(r, 'wine', 'name', 'nazwa'), vintage: g(r, 'vintage', 'rocznik'),
      region: g(r, 'region'), grape: g(r, 'grape', 'szczep', 'variety'), style: g(r, 'style', 'colour', 'color', 'typ'),
      glassPrice: num(g(r, 'glass', 'kieliszek')), bottlePrice: num(g(r, 'bottle', 'butelka')), issues
    };
    if (!row.producer) issues.push('Missing producer');
    if (row.bottlePrice === null) issues.push('Missing bottle price');
    if (!row.grape) issues.push('No grape, profile uses style defaults');
    return row;
  });
}

export const SAMPLE_MENU_CSV = `category,name,description,price
Starters,Smoked trout rillettes,"Smoked trout, horseradish cream, pickled cucumber",46
Mains,Roast chicken for two,"Free-range chicken, chanterelles, roasted garlic jus",158
Mains,Grilled cauliflower steak,"Charred cauliflower, tahini, chili, pomegranate",62
Desserts,Plum tart,"Baked plum tart, vanilla ice cream",36
Mains,Veal schnitzel,"Breaded veal, potato salad, lemon",`;

export const SAMPLE_WINES_CSV = `producer,wine,vintage,region,grape,style,glass price,bottle price
Weingut Keller,Riesling trocken,2022,Rheinhessen,Riesling,White,52,240
Domaine Huet,Le Haut-Lieu Sec,2021,Vouvray,Chenin Blanc,White,,310
Isole e Olena,Chianti Classico,2020,Tuscany,Sangiovese,Red,46,220
Winnica Srebrna Góra,Pinot Noir,2022,Małopolska,,Red,44,
Bérêche & Fils,Brut Réserve,NV,Champagne,Chardonnay,Sparkling,68,360`;
