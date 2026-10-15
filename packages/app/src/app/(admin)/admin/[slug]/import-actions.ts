'use server';

import { IMPORT_LIMITS, TRANSLATION_FIELDS, type RowEdit } from '@wine-match/core';
import { act, localeFields, str, translationsOrInvalid } from '@/server/action-runner';

/**
 * Server actions of the import screens and of Setup. The preview is a form: every row has fields named
 * `row_<n>_<field>` and a tick `row_<n>_include`; `rows` lists the row numbers that are on the page.
 */

const KINDS = ['menu', 'wines'] as const;
const kindOf = (f: FormData) => (KINDS.find((k) => k === str(f, 'kind')) ?? 'menu');

function editsFrom(f: FormData, fields: readonly string[]): RowEdit[] {
  return str(f, 'rows').split(',').filter(Boolean).map((n) => ({
    rowNumber: Number(n),
    fields: Object.fromEntries(fields.filter((k) => f.has(`row_${n}_${k}`)).map((k) => [k, str(f, `row_${n}_${k}`)])),
    include: f.has(`row_${n}_include`)
  })).filter((e) => Number.isInteger(e.rowNumber) && e.rowNumber > 0);
}

/** The base fields and the translation columns; `editsFrom` reads only those the form has. */
const FIELDS = {
  menu: ['category', 'name', 'description', 'price', ...TRANSLATION_FIELDS.menu],
  wines: ['producer', 'name', 'vintage', 'region', 'country', 'grape', 'style', 'glassPrice', 'bottlePrice', ...TRANSLATION_FIELDS.wines]
} as const;

export async function uploadImport(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }): Promise<Record<string, string>> => {
    const kind = kindOf(f);
    const file = f.get('file');
    // a browser sends an empty file name when nothing was chosen, and a real name with size 0 for an empty file
    if (!(file instanceof File) || !file.name) return { error: 'no_file', to: `/admin/${slug}/import/${kind}` };
    if (file.size === 0) return { error: 'empty_file', to: `/admin/${slug}/import/${kind}` };
    if (file.size > IMPORT_LIMITS.maxBytes) return { error: 'file_too_large', to: `/admin/${slug}/import/${kind}` };
    const job = await c.importService.upload(slug, kind, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, actor);
    return { saved: 'import_uploaded', to: `/admin/${slug}/import/${kind}?job=${job.id}` };
  });
}

/** "Check again": applies the corrections and shows the preview once more. */
export async function saveImportRows(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, form: f }) => {
    const kind = kindOf(f);
    await c.importService.updateRows(slug, str(f, 'job'), editsFrom(f, FIELDS[kind]));
    return { saved: 'import_checked', to: `/admin/${slug}/import/${kind}?job=${str(f, 'job')}` };
  });
}

export async function confirmImport(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }) => {
    const kind = kindOf(f);
    const job = str(f, 'job');
    try {
      const r = await c.importService.confirm(slug, job, actor, editsFrom(f, FIELDS[kind]));
      return { saved: 'imported', n: `${r.created}-${r.updated}-${r.suggestions}`, to: `/admin/${slug}/import/${kind}?job=${job}` };
    } catch (e) {
      // keep what the user typed: the corrections are saved before the refusal is shown on the preview
      await c.importService.updateRows(slug, job, editsFrom(f, FIELDS[kind]));
      throw e;
    }
  });
}

export async function cancelImport(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, form: f }) => {
    await c.importService.cancel(slug, str(f, 'job'));
    return { saved: 'import_cancelled', to: `/admin/${slug}/import/${kindOf(f)}` };
  });
}

export async function saveRestaurantDetails(form: FormData) {
  return act(form, 'restaurant.edit', async ({ c, slug, form: f }) => {
    const next = await c.restaurantService.updateDetails(slug, {
      name: str(f, 'name'), slug: str(f, 'newSlug') || slug, address: str(f, 'address'), city: str(f, 'city'), wineDirector: str(f, 'wineDirector')
    });
    return { saved: next.slug !== slug ? 'details_slug' : 'details', to: `/admin/${next.slug}/setup` };
  });
}

/** A10: the language of the base texts, and the tagline and city in Polish and English (spec 2026-10-15-bilingual-content, R6). */
export async function saveRestaurantContent(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }) => translationsOrInvalid(async () => {
    await c.translationService.setRestaurantContent(slug, { contentLocale: str(f, 'contentLocale'), translations: localeFields(f, ['tagline', 'city']) }, actor, str(f, 'version') || undefined);
    return { saved: 'content', to: `/admin/${slug}/setup` };
  }));
}

export async function generateSuggestions(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug }) => {
    const n = await c.importService.regenerateSuggestions(slug);
    return { saved: 'suggestions', n: String(n), to: `/admin/${slug}/setup` };
  });
}
