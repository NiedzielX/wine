import type { Dish, Restaurant, Wine } from '../domain/types';

/**
 * Fictional premium restaurant used across the mockups.
 * Halka — modern Polish cooking, Warsaw. All names, prices and people are invented
 * for demonstration; producers are real estates used only as realistic list entries.
 */
export const RESTAURANT: Restaurant = {
  id: 'rst_halka',
  slug: 'halka',
  name: 'Halka',
  tagline: 'Modern Polish cooking, Mokotowska street',
  address: 'ul. Mokotowska 48',
  city: 'Warsaw',
  currency: 'PLN',
  wineDirector: 'Marta Wierzbicka',
  publishedAt: '2026-10-09T17:40:00Z'
};

export const DISHES: Dish[] = [
  {
    id: 'd_tartare', name: 'Beef tartare', category: 'Starters', price: 68, status: 'published',
    description: 'Hand-cut tenderloin, pickled chanterelles, smoked egg yolk, rye crisp',
    profile: { intensity: 3, fat: 3, salt: 3, sweetness: 0, acidity: 2, spice: 1, umami: 4, smoke: 2, creaminess: 1, protein: 'beef', cooking: 'raw', source: 'confirmed' }
  },
  {
    id: 'd_herring', name: 'Baltic herring', category: 'Starters', price: 49, status: 'published',
    description: 'Cured herring, beetroot, sour cream, dill oil, sourdough',
    profile: { intensity: 2, fat: 3, salt: 4, sweetness: 1, acidity: 3, spice: 0, umami: 3, smoke: 0, creaminess: 2, protein: 'fish', cooking: 'cured', source: 'confirmed' }
  },
  {
    id: 'd_burrata', name: 'Burrata & roasted pumpkin', category: 'Starters', price: 54, status: 'published',
    description: 'Burrata, honey-roasted pumpkin, pumpkin seed pesto, sage',
    profile: { intensity: 2, fat: 4, salt: 2, sweetness: 2, acidity: 1, spice: 0, umami: 2, smoke: 0, creaminess: 4, protein: 'dairy', cooking: 'roasted', source: 'confirmed' }
  },
  {
    id: 'd_scallops', name: 'Seared scallops', category: 'Starters', price: 72, status: 'published',
    description: 'Hokkaido scallops, brown butter, cauliflower purée, hazelnut',
    profile: { intensity: 2, fat: 3, salt: 2, sweetness: 2, acidity: 1, spice: 0, umami: 3, smoke: 1, creaminess: 3, protein: 'shellfish', cooking: 'seared', source: 'draft' }
  },
  {
    id: 'd_risotto', name: 'Wild mushroom risotto', category: 'Mains', price: 79, status: 'published',
    description: 'Carnaroli, porcini, aged Bursztyn cheese, thyme',
    profile: { intensity: 3, fat: 3, salt: 3, sweetness: 0, acidity: 1, spice: 0, umami: 5, smoke: 0, creaminess: 4, protein: 'mushroom', cooking: 'braised', source: 'confirmed' }
  },
  {
    id: 'd_pikeperch', name: 'Pike-perch', category: 'Mains', price: 98, status: 'published',
    description: 'Butter-poached pike-perch, beurre blanc, charred leek, Polish caviar',
    profile: { intensity: 2, fat: 3, salt: 3, sweetness: 0, acidity: 2, spice: 0, umami: 3, smoke: 1, creaminess: 3, protein: 'fish', cooking: 'poached', source: 'confirmed' }
  },
  {
    id: 'd_duck', name: 'Duck breast', category: 'Mains', price: 112, status: 'published',
    description: 'Roasted duck breast, sour cherry jus, beetroot, toasted buckwheat',
    profile: { intensity: 4, fat: 4, salt: 2, sweetness: 2, acidity: 2, spice: 1, umami: 3, smoke: 1, creaminess: 0, protein: 'poultry', cooking: 'roasted', source: 'confirmed' }
  },
  {
    id: 'd_venison', name: 'Venison loin', category: 'Mains', price: 138, status: 'published',
    description: 'Juniper-crusted venison, blackberries, celeriac, game jus',
    profile: { intensity: 5, fat: 2, salt: 2, sweetness: 1, acidity: 2, spice: 1, umami: 4, smoke: 2, creaminess: 1, protein: 'game', cooking: 'roasted', source: 'confirmed' }
  },
  {
    id: 'd_ribeye', name: 'Dry-aged ribeye, 300 g', category: 'Mains', price: 169, status: 'published',
    description: '45-day dry-aged ribeye, bone marrow butter, charred onion',
    profile: { intensity: 5, fat: 5, salt: 3, sweetness: 0, acidity: 0, spice: 1, umami: 5, smoke: 4, creaminess: 1, protein: 'beef', cooking: 'grilled', source: 'confirmed' }
  },
  {
    id: 'd_porkbelly', name: 'Glazed pork belly', category: 'Mains', price: 89, status: 'published',
    description: 'Gochujang glaze, pickled kohlrabi, apple, mustard seed',
    profile: { intensity: 4, fat: 5, salt: 3, sweetness: 3, acidity: 2, spice: 3, umami: 3, smoke: 1, creaminess: 0, protein: 'pork', cooking: 'braised', source: 'draft' }
  },
  {
    id: 'd_pierogi', name: 'Goose pierogi', category: 'Mains', price: 64, status: 'published',
    description: 'Goose and marjoram filling, onion confit, crackling',
    profile: { intensity: 3, fat: 4, salt: 3, sweetness: 1, acidity: 1, spice: 0, umami: 3, smoke: 0, creaminess: 1, protein: 'poultry', cooking: 'fried', source: 'confirmed' }
  },
  {
    id: 'd_celeriac', name: 'Salt-baked celeriac', category: 'Mains', price: 74, status: 'published',
    description: 'Miso butter, walnuts, apple, hazelnut oil',
    profile: { intensity: 3, fat: 3, salt: 3, sweetness: 1, acidity: 1, spice: 0, umami: 4, smoke: 1, creaminess: 2, protein: 'vegetable', cooking: 'baked', source: 'draft' }
  },
  {
    id: 'd_chocolate', name: 'Dark chocolate tart', category: 'Desserts', price: 42, status: 'published',
    description: '70% chocolate, sour cherry, crème fraîche',
    profile: { intensity: 4, fat: 3, salt: 1, sweetness: 4, acidity: 2, spice: 0, umami: 0, smoke: 0, creaminess: 2, protein: 'dessert', cooking: 'baked', source: 'confirmed' }
  },
  {
    id: 'd_sernik', name: 'Baked sernik', category: 'Desserts', price: 38, status: 'published',
    description: 'Twaróg cheesecake, sea buckthorn, oat crumble',
    profile: { intensity: 2, fat: 3, salt: 1, sweetness: 3, acidity: 3, spice: 0, umami: 0, smoke: 0, creaminess: 3, protein: 'dessert', cooking: 'baked', source: 'confirmed' }
  },
  {
    id: 'd_cheese', name: 'Polish cheese selection', category: 'Desserts', price: 56, status: 'draft',
    description: 'Five farmhouse cheeses, quince, walnut bread',
    profile: { intensity: 4, fat: 4, salt: 4, sweetness: 1, acidity: 1, spice: 0, umami: 3, smoke: 0, creaminess: 3, protein: 'dairy', cooking: 'none', source: 'draft' }
  }
];

export const WINES: Wine[] = [
  {
    id: 'w_gimonnet', producer: 'Pierre Gimonnet & Fils', name: 'Cuis 1er Cru Blanc de Blancs Brut', vintage: 'NV',
    region: 'Champagne', country: 'France', grapes: ['Chardonnay'], glassPrice: 72, glassPour: 125, bottlePrice: 390, bottleSize: 750, active: true,
    colour: '#E8D9A0', tastingNote: 'Chalky and precise, green apple and brioche, a long saline finish.',
    profile: { sweetness: 1, acidity: 5, tannin: 0, body: 2, alcohol: 12, fruitiness: 2, oak: 0, aromatic: 2, freshness: 5, style: 'sparkling', adventurous: false }
  },
  {
    id: 'w_denit', producer: 'Raventós i Blanc', name: 'De Nit Rosé', vintage: 2021,
    region: 'Conca del Riu Anoia', country: 'Spain', grapes: ['Xarel·lo', 'Macabeo', 'Monastrell'], glassPrice: 52, glassPour: 125, bottlePrice: 260, bottleSize: 750, active: true,
    colour: '#E7B7A3', tastingNote: 'Pale and dry, wild strawberry, citrus peel and fine bubbles.',
    profile: { sweetness: 1, acidity: 4, tannin: 0, body: 2, alcohol: 12, fruitiness: 3, oak: 0, aromatic: 2, freshness: 5, style: 'sparkling', adventurous: true }
  },
  {
    id: 'w_turnau', producer: 'Winnica Turnau', name: 'Solaris', vintage: 2023,
    region: 'West Pomerania', country: 'Poland', grapes: ['Solaris'], glassPrice: 38, glassPour: 150, bottlePrice: 165, bottleSize: 750, active: true,
    colour: '#E6DC9C', tastingNote: 'Bright and aromatic, gooseberry, elderflower, crisp northern acidity.',
    profile: { sweetness: 1, acidity: 4, tannin: 0, body: 2, alcohol: 12.5, fruitiness: 3, oak: 0, aromatic: 4, freshness: 4, style: 'white', adventurous: true }
  },
  {
    id: 'w_loosen', producer: 'Dr. Loosen', name: 'Graacher Himmelreich Riesling Kabinett', vintage: 2021,
    region: 'Mosel', country: 'Germany', grapes: ['Riesling'], glassPrice: 46, glassPour: 150, bottlePrice: 210, bottleSize: 750, active: true,
    colour: '#E3D78C', tastingNote: 'Off-dry, white peach and lime, slate and a feather-light body.',
    profile: { sweetness: 2, acidity: 5, tannin: 0, body: 1, alcohol: 8.5, fruitiness: 4, oak: 0, aromatic: 4, freshness: 5, style: 'white', adventurous: false }
  },
  {
    id: 'w_vacheron', producer: 'Domaine Vacheron', name: 'Sancerre', vintage: 2022,
    region: 'Loire', country: 'France', grapes: ['Sauvignon Blanc'], glassPrice: 58, glassPour: 150, bottlePrice: 290, bottleSize: 750, active: true,
    colour: '#E1DA9E', tastingNote: 'Flint, grapefruit and cut grass with a mineral, mouth-watering finish.',
    profile: { sweetness: 0, acidity: 5, tannin: 0, body: 2, alcohol: 13, fruitiness: 3, oak: 0, aromatic: 4, freshness: 5, style: 'white', adventurous: false }
  },
  {
    id: 'w_bruendlmayer', producer: 'Bründlmayer', name: 'Kamptaler Terrassen Grüner Veltliner', vintage: 2022,
    region: 'Kamptal', country: 'Austria', grapes: ['Grüner Veltliner'], glassPrice: 44, glassPour: 150, bottlePrice: 195, bottleSize: 750, active: true,
    colour: '#DED79A', tastingNote: 'White pepper, green pear and lentil, lively and dry.',
    profile: { sweetness: 0, acidity: 4, tannin: 0, body: 2, alcohol: 12.5, fruitiness: 3, oak: 0, aromatic: 3, freshness: 4, style: 'white', adventurous: true }
  },
  {
    id: 'w_leflaive', producer: 'Domaine Leflaive', name: 'Mâcon-Verzé', vintage: 2021,
    region: 'Burgundy', country: 'France', grapes: ['Chardonnay'], glassPrice: null, glassPour: 150, bottlePrice: 340, bottleSize: 750, active: true,
    colour: '#E5D38A', tastingNote: 'Ripe lemon, hazelnut and a gentle creamy texture with fine tension.',
    profile: { sweetness: 0, acidity: 4, tannin: 0, body: 3, alcohol: 13, fruitiness: 3, oak: 1, aromatic: 2, freshness: 4, style: 'white', adventurous: false }
  },
  {
    id: 'w_kumeu', producer: 'Kumeu River', name: 'Estate Chardonnay', vintage: 2021,
    region: 'Auckland', country: 'New Zealand', grapes: ['Chardonnay'], glassPrice: 62, glassPour: 150, bottlePrice: 310, bottleSize: 750, active: true,
    colour: '#E2C978', tastingNote: 'Toasted nuts, citrus curd and a rich, layered palate.',
    profile: { sweetness: 0, acidity: 3, tannin: 0, body: 4, alcohol: 13.5, fruitiness: 3, oak: 3, aromatic: 2, freshness: 3, style: 'white', adventurous: false }
  },
  {
    id: 'w_radikon', producer: 'Radikon', name: 'Slatnik', vintage: 2019,
    region: 'Friuli Venezia Giulia', country: 'Italy', grapes: ['Chardonnay', 'Friulano'], glassPrice: null, glassPour: 150, bottlePrice: 320, bottleSize: 750, active: true,
    colour: '#D89B4E', tastingNote: 'Skin-contact amber wine, dried apricot, tea and a gentle grip.',
    profile: { sweetness: 0, acidity: 4, tannin: 2, body: 3, alcohol: 13, fruitiness: 2, oak: 1, aromatic: 3, freshness: 3, style: 'orange', adventurous: true }
  },
  {
    id: 'w_tempier', producer: 'Domaine Tempier', name: 'Bandol Rosé', vintage: 2022,
    region: 'Provence', country: 'France', grapes: ['Mourvèdre', 'Grenache', 'Cinsault'], glassPrice: 56, glassPour: 150, bottlePrice: 280, bottleSize: 750, active: true,
    colour: '#EDB6A2', tastingNote: 'Structured rosé, blood orange, garrigue and savoury depth.',
    profile: { sweetness: 0, acidity: 4, tannin: 1, body: 3, alcohol: 13.5, fruitiness: 3, oak: 0, aromatic: 3, freshness: 4, style: 'rose', adventurous: false }
  },
  {
    id: 'w_lapierre', producer: 'Marcel Lapierre', name: 'Morgon', vintage: 2022,
    region: 'Beaujolais', country: 'France', grapes: ['Gamay'], glassPrice: 48, glassPour: 150, bottlePrice: 230, bottleSize: 750, active: true,
    colour: '#8E2A3A', tastingNote: 'Juicy red cherry and violet, silky and lightly chilled.',
    profile: { sweetness: 0, acidity: 4, tannin: 1, body: 2, alcohol: 13, fruitiness: 4, oak: 0, aromatic: 3, freshness: 4, style: 'red', adventurous: false }
  },
  {
    id: 'w_savigny', producer: 'Domaine Chandon de Briailles', name: 'Savigny-lès-Beaune', vintage: 2020,
    region: 'Burgundy', country: 'France', grapes: ['Pinot Noir'], glassPrice: 64, glassPour: 150, bottlePrice: 320, bottleSize: 750, active: true,
    colour: '#7D2234', tastingNote: 'Red berries, forest floor and fine-grained tannins.',
    profile: { sweetness: 0, acidity: 4, tannin: 2, body: 2, alcohol: 13, fruitiness: 3, oak: 1, aromatic: 3, freshness: 4, style: 'red', adventurous: false }
  },
  {
    id: 'w_feltonroad', producer: 'Felton Road', name: 'Bannockburn Pinot Noir', vintage: 2021,
    region: 'Central Otago', country: 'New Zealand', grapes: ['Pinot Noir'], glassPrice: null, glassPour: 150, bottlePrice: 380, bottleSize: 750, active: true,
    colour: '#74203A', tastingNote: 'Dark cherry, spice and a plush, generous texture.',
    profile: { sweetness: 0, acidity: 3, tannin: 2, body: 3, alcohol: 14, fruitiness: 4, oak: 2, aromatic: 3, freshness: 3, style: 'red', adventurous: false }
  },
  {
    id: 'w_graillot', producer: 'Alain Graillot', name: 'Crozes-Hermitage', vintage: 2020,
    region: 'Northern Rhône', country: 'France', grapes: ['Syrah'], glassPrice: 58, glassPour: 150, bottlePrice: 275, bottleSize: 750, active: true,
    colour: '#5C1830', tastingNote: 'Blackberry, black olive and cracked pepper, firm and savoury.',
    profile: { sweetness: 0, acidity: 3, tannin: 3, body: 4, alcohol: 13.5, fruitiness: 3, oak: 1, aromatic: 3, freshness: 3, style: 'red', adventurous: false }
  },
  {
    id: 'w_produttori', producer: 'Produttori del Barbaresco', name: 'Barbaresco', vintage: 2019,
    region: 'Piedmont', country: 'Italy', grapes: ['Nebbiolo'], glassPrice: 72, glassPour: 150, bottlePrice: 360, bottleSize: 750, active: true,
    colour: '#7A2E2E', tastingNote: 'Rose petal, tar and sour cherry, high acidity and grippy tannins.',
    profile: { sweetness: 0, acidity: 5, tannin: 5, body: 4, alcohol: 14, fruitiness: 3, oak: 2, aromatic: 4, freshness: 3, style: 'red', adventurous: false }
  },
  {
    id: 'w_batailley', producer: 'Château Batailley', name: 'Pauillac 5ème Cru Classé', vintage: 2016,
    region: 'Bordeaux', country: 'France', grapes: ['Cabernet Sauvignon', 'Merlot'], glassPrice: null, glassPour: 150, bottlePrice: 520, bottleSize: 750, active: true,
    colour: '#4E1426', tastingNote: 'Cassis, cedar and graphite, structured and long.',
    profile: { sweetness: 0, acidity: 3, tannin: 4, body: 5, alcohol: 13.5, fruitiness: 3, oak: 4, aromatic: 3, freshness: 2, style: 'red', adventurous: false }
  },
  {
    id: 'w_ridge', producer: 'Ridge Vineyards', name: 'Geyserville', vintage: 2020,
    region: 'Sonoma County', country: 'USA', grapes: ['Zinfandel', 'Carignane', 'Petite Sirah'], glassPrice: null, glassPour: 150, bottlePrice: 440, bottleSize: 750, active: true,
    colour: '#561428', tastingNote: 'Ripe bramble fruit, sweet spice and a warm, full finish.',
    profile: { sweetness: 1, acidity: 3, tannin: 3, body: 5, alcohol: 14.5, fruitiness: 5, oak: 3, aromatic: 3, freshness: 2, style: 'red', adventurous: false }
  },
  {
    id: 'w_tokaji', producer: 'Royal Tokaji', name: '5 Puttonyos Aszú', vintage: 2017,
    region: 'Tokaj', country: 'Hungary', grapes: ['Furmint', 'Hárslevelű'], glassPrice: 48, glassPour: 75, bottlePrice: 290, bottleSize: 500, active: true,
    colour: '#D49B3A', tastingNote: 'Apricot, orange marmalade and honey, lifted by bright acidity.',
    profile: { sweetness: 5, acidity: 5, tannin: 0, body: 4, alcohol: 11, fruitiness: 5, oak: 1, aromatic: 5, freshness: 4, style: 'sweet', adventurous: false }
  },
  {
    id: 'w_grahams', producer: "Graham's", name: '20 Year Old Tawny Port', vintage: 'NV',
    region: 'Douro', country: 'Portugal', grapes: ['Touriga Nacional', 'Touriga Franca'], glassPrice: 42, glassPour: 75, bottlePrice: 420, bottleSize: 750, active: true,
    colour: '#9A4A26', tastingNote: 'Walnut, fig and caramel, mellow and long.',
    profile: { sweetness: 4, acidity: 3, tannin: 1, body: 4, alcohol: 20, fruitiness: 3, oak: 4, aromatic: 4, freshness: 2, style: 'sweet', adventurous: false }
  },
  {
    id: 'w_musar', producer: 'Château Musar', name: 'Hochar Père et Fils', vintage: 2018,
    region: 'Bekaa Valley', country: 'Lebanon', grapes: ['Cinsault', 'Grenache', 'Cabernet Sauvignon'], glassPrice: null, glassPour: 150, bottlePrice: 245, bottleSize: 750, active: false,
    colour: '#6A2030', tastingNote: 'Spiced plum, leather and dried herbs. Currently out of stock.',
    profile: { sweetness: 0, acidity: 3, tannin: 3, body: 3, alcohol: 14, fruitiness: 3, oak: 2, aromatic: 3, freshness: 3, style: 'red', adventurous: true }
  }
];

/**
 * Sommelier decisions seeded on top of engine suggestions.
 * Dishes not listed here keep engine suggestions in status "suggested" — they form the review queue.
 */
export const SEED_DECISIONS: Array<{
  dishId: string; wineId: string; status: 'approved' | 'modified' | 'rejected';
  role?: 'primary' | 'alternative' | 'best_value'; rank?: number; comment?: string;
}> = [
  { dishId: 'd_tartare', wineId: 'w_lapierre', status: 'modified', role: 'primary', rank: 1, comment: 'Served lightly chilled — the fruit lifts the smoked yolk.' },
  { dishId: 'd_tartare', wineId: 'w_gimonnet', status: 'approved', role: 'alternative', rank: 2 },
  { dishId: 'd_herring', wineId: 'w_bruendlmayer', status: 'approved', role: 'primary', rank: 1, comment: 'White pepper and dill — a classic Halka pairing.' },
  { dishId: 'd_herring', wineId: 'w_turnau', status: 'approved', role: 'best_value', rank: 2 },
  { dishId: 'd_risotto', wineId: 'w_kumeu', status: 'approved', role: 'primary', rank: 1 },
  { dishId: 'd_risotto', wineId: 'w_savigny', status: 'modified', role: 'alternative', rank: 2, comment: 'Forest floor in the glass, porcini on the plate.' },
  { dishId: 'd_pikeperch', wineId: 'w_leflaive', status: 'approved', role: 'primary', rank: 1, comment: 'Enough texture for the beurre blanc, still precise.' },
  { dishId: 'd_pikeperch', wineId: 'w_produttori', status: 'rejected' },
  { dishId: 'd_duck', wineId: 'w_savigny', status: 'approved', role: 'primary', rank: 1, comment: 'Pinot and sour cherry jus — our signature match.' },
  { dishId: 'd_duck', wineId: 'w_lapierre', status: 'approved', role: 'best_value', rank: 2 },
  { dishId: 'd_venison', wineId: 'w_graillot', status: 'approved', role: 'primary', rank: 1, comment: 'Peppery Syrah meets juniper.' },
  { dishId: 'd_ribeye', wineId: 'w_batailley', status: 'approved', role: 'primary', rank: 1 },
  { dishId: 'd_ribeye', wineId: 'w_graillot', status: 'approved', role: 'best_value', rank: 2 },
  { dishId: 'd_chocolate', wineId: 'w_grahams', status: 'approved', role: 'primary', rank: 1 },
  { dishId: 'd_sernik', wineId: 'w_tokaji', status: 'approved', role: 'primary', rank: 1, comment: 'Sea buckthorn and Aszú share the same bright acidity.' }
];
