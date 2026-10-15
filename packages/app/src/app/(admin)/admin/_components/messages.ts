import { WINE_STYLES, styleLabel, type ImportIssue, type ImportKind, type Locale, type WineStyle } from '@wine-match/core';
import { en, type Dictionary } from '@/i18n/en';

/**
 * Messages of the dashboard chosen by their code, in the interface language (spec 2026-10-15-polish-language,
 * R13 / A9): flash results of a change (`?saved=` / `?error=`), import issues and import notes. The codes come from
 * the server actions, the domain errors and `core/import`; core keeps no dictionaries.
 */

type Flash = Dictionary['admin']['flash'];

const num = (n: string | undefined) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export function savedText(f: Flash, saved: string | undefined, n: string | undefined): string | undefined {
  const s = f.saved;
  switch (saved) {
    case 'approved_all': return s.approved_all(num(n));
    case 'published': return s.published(num(n));
    case 'suggestions': return s.suggestions(num(n));
    case 'imported': {
      const [created = 0, updated = 0, suggestions = 0] = (n ?? '0-0-0').split('-').map(num);
      return s.imported(created, updated, suggestions);
    }
    case 'approved': case 'rejected': case 'restored': case 'role': case 'note': case 'moved': case 'added': case 'deleted':
    case 'wine_shown': case 'wine_hidden': case 'settings': case 'import_uploaded': case 'import_checked': case 'import_cancelled':
    case 'details': case 'details_slug': case 'translations': case 'content':
      return s[saved]();
    default: return undefined;
  }
}

export function errorText(f: Flash, error: string): string {
  return Object.hasOwn(f.errors, error) ? f.errors[error as keyof Flash['errors']] : f.errors.unexpected;
}

const isStyle = (v: string | undefined): v is WineStyle => WINE_STYLES.some((s) => s === v);

/** The issue in the user's language, chosen by its code; the English message when there is no code. */
export function issueText(issue: ImportIssue, kind: ImportKind, t: Dictionary, locale: Locale): string {
  if (!issue.code) return issue.message;
  const texts = t.admin.import.issues;
  const guess = issue.params?.guess;
  const params = { ...issue.params, ...(isStyle(guess) ? { guess: styleLabel(guess, locale).toLowerCase() } : {}) };
  const text = issue.code === 'exists' && kind === 'menu' ? texts.exists_menu : texts[issue.code];
  return text ? text(params) : issue.message;
}

/** A note about how the file was read, in the user's language when it is one of the known ones. */
export function noteText(note: string, t: Dictionary): string {
  const n = t.admin.import.notes;
  const english = en.admin.import.notes;
  if (note === english.pdf) return n.pdf;
  if (note === english.noCategory) return n.noCategory;
  const unused = /^Columns not used: (.*)\.$/.exec(note);
  if (unused) return n.unused(unused[1]);
  const order = /^No header row was found, so the columns were read in this order: (.*)\.$/.exec(note);
  if (order) {
    const columns = t.admin.import.columns as Record<string, string>;
    return n.noHeader(order[1].split(', ').map((k) => columns[k] ?? k).join(', '));
  }
  return note;
}

