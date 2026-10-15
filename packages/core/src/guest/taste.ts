import type { Dish } from '../domain/types';
import type { Locale, Localized } from '../i18n/locale';

const W = {
  full: { en: 'Full-flavoured', pl: 'Wyrazisty' },
  delicate: { en: 'Delicate', pl: 'Delikatny' },
  savoury: { en: 'Savoury', pl: 'Wytrawny' },
  smoky: { en: 'Smoky, charred', pl: 'Dymny, z grilla' },
  creamy: { en: 'Creamy', pl: 'Kremowy' },
  spicy: { en: 'Gently spicy', pl: 'Lekko pikantny' },
  sweet: { en: 'Sweet', pl: 'Słodki' },
  tangy: { en: 'Bright, tangy', pl: 'Świeży, kwaskowy' },
  salty: { en: 'Salty', pl: 'Słony' },
  rich: { en: 'Rich', pl: 'Treściwy' },
  sweetSour: { en: 'Sweet and sour notes', pl: 'Nuty słodko-kwaśne' }
} satisfies Record<string, Localized>;

/** Up to four plain-language taste words for a dish, derived from its taste profile, in the interface language. */
export function tasteWords(d: Dish, locale: Locale = 'en'): string[] {
  const p = d.profile;
  const words: Localized[] = [];
  if (p.intensity >= 4) words.push(W.full); else if (p.intensity <= 2) words.push(W.delicate);
  if (p.umami >= 4) words.push(W.savoury);
  if (p.smoke >= 3) words.push(W.smoky);
  if (p.creaminess >= 3) words.push(W.creamy);
  if (p.spice >= 2) words.push(W.spicy);
  if (p.sweetness >= 3) words.push(W.sweet);
  if (p.acidity >= 3) words.push(W.tangy);
  if (p.salt >= 4) words.push(W.salty);
  if (p.fat >= 4 && p.protein !== 'dessert') words.push(W.rich);
  if (p.sweetness === 2 && p.protein !== 'dessert') words.push(W.sweetSour);
  return words.slice(0, 4).map((w) => w[locale]);
}
