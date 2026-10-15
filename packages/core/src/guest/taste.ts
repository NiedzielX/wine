import type { Dish } from '../domain/types';

/** Up to four plain-language taste words for a dish, derived from its taste profile. */
export function tasteWords(d: Dish): string[] {
  const p = d.profile;
  const words: string[] = [];
  if (p.intensity >= 4) words.push('Full-flavoured'); else if (p.intensity <= 2) words.push('Delicate');
  if (p.umami >= 4) words.push('Savoury');
  if (p.smoke >= 3) words.push('Smoky, charred');
  if (p.creaminess >= 3) words.push('Creamy');
  if (p.spice >= 2) words.push('Gently spicy');
  if (p.sweetness >= 3) words.push('Sweet');
  if (p.acidity >= 3) words.push('Bright, tangy');
  if (p.salt >= 4) words.push('Salty');
  if (p.fat >= 4 && p.protein !== 'dessert') words.push('Rich');
  if (p.sweetness === 2 && p.protein !== 'dessert') words.push('Sweet and sour notes');
  return words.slice(0, 4);
}
