/**
 * Interface languages of Wine Match (spec 2026-10-15-polish-language, R1–R2). Pure and runtime-agnostic:
 * the app's proxy picks the language with `pickLocale`, the engine and guest helpers take a `Locale`.
 * Restaurant content (dish and wine names, sommelier notes) is never translated.
 */
export type Locale = 'pl' | 'en';

export const LOCALES: readonly Locale[] = ['pl', 'en'];

/** The language when nothing else decides: the public API and every caller that passes no locale. */
export const DEFAULT_LOCALE: Locale = 'en';

/** A text in every interface language. The type makes a missing translation a compile error. */
export type Localized = Readonly<Record<Locale, string>>;

export function isLocale(value: unknown): value is Locale {
  return value === 'pl' || value === 'en';
}

/**
 * The best supported language from an `Accept-Language` header: the entry with the highest quality whose
 * primary subtag is `pl` or `en` (ties keep the header order). No match, `*` only or no header → `en`.
 *   pickLocale('pl-PL,pl;q=0.9') → 'pl';  pickLocale('de, pl;q=0.8') → 'pl';  pickLocale(null) → 'en'
 */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam === undefined ? 1 : Number(qParam.slice(2));
      return { lang: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { lang } of ranked) if (isLocale(lang)) return lang;
  return DEFAULT_LOCALE;
}
