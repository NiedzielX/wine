import type { Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';
import type { CatalogFormLabels } from './catalog-forms';
import { formatDateTime } from './format';

/**
 * What A3 and A5 hand to their "Details" and "Listing" forms (spec 2026-11-16-catalog-field-editing, R10, R11, R15):
 * the texts with their numbers and names already filled in, because a client component cannot take functions.
 */

/** A price as it is typed in a form: whole numbers without decimals, otherwise two places; a decimal comma in Polish. */
export function priceText(n: number | null, locale: Locale): string {
  if (n === null) return '';
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return locale === 'pl' ? s.replace('.', ',') : s;
}

export interface CatalogInfoForForm {
  lastEdit: { actor: string; at: string } | null;
  staleLocales: string[];
  /** approved or modified pairings of this dish or wine: the rename warning is shown when there are any */
  pairs: number;
}

export function catalogFormLabels(t: Dictionary, locale: Locale, kind: 'dish' | 'wine', info: CatalogInfoForForm, canSeeAuthor: boolean): CatalogFormLabels {
  const c = t.admin.catalog;
  // the name of the editor only for roles with `audit.view`; everyone else sees the date (R10, W10)
  const lastEdit = info.lastEdit
    ? (canSeeAuthor ? c.lastEditBy.replace('{name}', info.lastEdit.actor) : c.lastEdit).replace('{date}', formatDateTime(info.lastEdit.at, locale))
    : null;
  const languages = info.staleLocales.map((l) => l.toUpperCase()).join(', ');
  return {
    save: c.save, baseHint: c.dish.baseHint, errors: c.errors, formErrors: c.formErrors, lastEdit,
    stale: languages ? c.stale.replace('{languages}', languages) : null, staleLink: c.staleLink,
    identityWarning: info.pairs > 0 ? c.identity[kind].replace('{n}', String(info.pairs)) : null, identityConfirm: c.identity.confirm, identityChecked: false
  };
}
