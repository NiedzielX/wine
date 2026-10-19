'use server';

import { IMPORT_LIMITS, SALES_FIELDS, SALES_ITEM_TYPES, TRANSLATION_FIELDS, type RowEdit, type ValueMapEntry } from '@wine-match/core';
import { act, localeFields, str, translationsOrInvalid } from '@/server/action-runner';
import { domainError } from '@/server/domain-errors';

/**
 * Server actions of the import screens and of Setup. The preview is a form: every row has fields named
 * `row_<n>_<field>` and a tick `row_<n>_include`; `rows` lists the row numbers that are on the page.
 */

const KINDS = ['menu', 'wines', 'sales'] as const;
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
  wines: ['producer', 'name', 'vintage', 'region', 'country', 'grape', 'style', 'glassPrice', 'bottlePrice', ...TRANSLATION_FIELDS.wines],
  sales: SALES_FIELDS
} as const;

/**
 * "Unrecognised categories" of a sales preview (spec 2026-10-15-pos-sales-import-attach-rate, Q3, R4): pairs
 * `typemap_<i>_from` (the category as in the file) and `typemap_<i>_to` (a type). A pair without a chosen type is not a
 * decision. The service compares `from` through a Map, so any text is safe here.
 */
function valueMapFrom(f: FormData): ValueMapEntry[] {
  const out: ValueMapEntry[] = [];
  for (let i = 0; i < 200 && f.has(`typemap_${i}_from`); i++) {
    const from = str(f, `typemap_${i}_from`).slice(0, 200);
    const to = SALES_ITEM_TYPES.find((t) => t === str(f, `typemap_${i}_to`));
    if (from && to) out.push({ field: 'itemType', from, to });
  }
  return out;
}

export async function uploadImport(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }): Promise<Record<string, string>> => {
    const kind = kindOf(f);
    const file = f.get('file');
    // a browser sends an empty file name when nothing was chosen, and a real name with size 0 for an empty file
    if (!(file instanceof File) || !file.name) return { error: 'no_file', to: `/admin/${slug}/import/${kind}` };
    if (file.size === 0) return { error: 'empty_file', to: `/admin/${slug}/import/${kind}` };
    if (file.size > IMPORT_LIMITS.maxBytes) return { error: 'file_too_large', to: `/admin/${slug}/import/${kind}` };
    try {
      const job = await c.importService.upload(slug, kind, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, actor);
      return { saved: 'import_uploaded', to: `/admin/${slug}/import/${kind}?job=${job.id}` };
    } catch (e) {
      // a sales file without a required column: the message names the missing columns (field names, never file text)
      const d = domainError(e);
      if (d?.code === 'no_header') return { error: 'no_header', n: Object.keys(d.fields ?? {}).filter((k) => SALES_FIELDS.some((s) => s === k)).join(','), to: `/admin/${slug}/import/${kind}` };
      throw e;
    }
  });
}

/** "Check again": applies the corrections and shows the preview once more. */
export async function saveImportRows(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, form: f }) => {
    const kind = kindOf(f);
    await c.importService.updateRows(slug, str(f, 'job'), editsFrom(f, FIELDS[kind]), kind === 'sales' ? valueMapFrom(f) : []);
    return { saved: 'import_checked', to: `/admin/${slug}/import/${kind}?job=${str(f, 'job')}` };
  });
}

export async function confirmImport(form: FormData) {
  return act(form, 'import.manage', async ({ c, slug, actor, form: f }) => {
    const kind = kindOf(f);
    const job = str(f, 'job');
    const valueMap = kind === 'sales' ? valueMapFrom(f) : [];
    try {
      const r = await c.importService.confirm(slug, job, actor, editsFrom(f, FIELDS[kind]), valueMap);
      if (kind === 'sales') return { saved: 'imported_sales', n: `${r.created}-${r.replaced ?? 0}-${r.skipped}`, to: `/admin/${slug}/import/${kind}?job=${job}` };
      return { saved: 'imported', n: `${r.created}-${r.updated}-${r.suggestions}`, to: `/admin/${slug}/import/${kind}?job=${job}` };
    } catch (e) {
      // keep what the user typed: the corrections are saved before the refusal is shown on the preview
      await c.importService.updateRows(slug, job, editsFrom(f, FIELDS[kind]), valueMap);
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
