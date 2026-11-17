'use server';

import { parseFormPrice } from '@wine-match/core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { perform, safeBack, str, withFlash, type Ctx } from '@/server/action-runner';
import { domainError } from '@/server/domain-errors';

/**
 * Server actions of the A3 "Details" and A5 "Listing" forms (spec 2026-11-16-catalog-field-editing, R11). Unlike the
 * pairing actions they do not redirect on a mistake: the state of the form (`useActionState`) carries the typed values
 * and the problem of each field back, and the server renders it into the response of the post, so a form without
 * JavaScript shows the same. A success redirects with `?saved=catalog_saved` (the page is then rendered from the stored
 * data). The permission is `catalog.edit`; the rules are `CatalogEditService`'s.
 */

/** What the form shows after a post that did not save. Serialisable: it travels from the server to the client component. */
export type DetailsState =
  | { status: 'idle' }
  | { status: 'error'; error?: string; fields: Record<string, string>; values: Record<string, string> };

const DISH_TEXT = ['name', 'description', 'category', 'price'] as const;
const WINE_TEXT = ['producer', 'name', 'vintage', 'region', 'country', 'tastingNote', 'listNumber', 'bottlePrice', 'glassPrice'] as const;

const values = (f: FormData, names: readonly string[], extra: Record<string, string> = {}) =>
  Object.fromEntries([...names.map((k) => [k, str(f, k)]), ...Object.entries(extra)]);

/**
 * A price from the form: a number, or `undefined` when it is not one (the field is then left out, so the other fields are still
 * checked, and the form's own code for it is noted: `not_a_number`, or `required` when empty).
 */
function price(text: string, field: string, formErrors: Map<string, string>): number | undefined {
  const n = parseFormPrice(text);
  if (n === null) {
    formErrors.set(field, text.trim() === '' ? 'required' : 'not_a_number');
    return undefined;
  }
  return n;
}

const compact = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** A whole number from a text field; anything else stays text (the schema says `invalid`, shown as `not_a_number`). */
const whole = (text: string): number | string => (/^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : text.trim());

function dishInput(f: FormData, formErrors: Map<string, string>) {
  return compact({ name: str(f, 'name'), description: str(f, 'description'), category: str(f, 'category'), price: price(str(f, 'price'), 'price', formErrors) });
}

function wineInput(f: FormData, formErrors: Map<string, string>) {
  const vintage = str(f, 'vintage').trim();
  const glass = f.getAll('pouredByGlass').map(String).includes('true');
  const listNumber = str(f, 'listNumber').trim();
  return compact({
    producer: str(f, 'producer'), name: str(f, 'name'), vintage: /^nv$/i.test(vintage) ? 'NV' : whole(vintage), region: str(f, 'region'), country: str(f, 'country'),
    tastingNote: str(f, 'tastingNote'), listNumber: listNumber === '' ? null : whole(listNumber), bottlePrice: price(str(f, 'bottlePrice'), 'bottlePrice', formErrors),
    pouredByGlass: glass, ...(glass ? { glassPrice: price(str(f, 'glassPrice'), 'glassPrice', formErrors) } : {})
  });
}

/** Field codes of the schema shown in a form: a text where a number belongs is "not a number". */
function formFields(fields: Record<string, string>, formErrors: Map<string, string>, numeric: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = v === 'invalid' && numeric.includes(k) ? 'not_a_number' : v;
  for (const [k, v] of formErrors) out[k] = v;
  return out;
}

type Kind = 'dish' | 'wine';
type Performed = { back: string; flash: Record<string, string> } | 'signed-out';

/** The change itself, run inside `perform` (which checked the session and `catalog.edit`): a refused value comes back as `invalid`, not thrown. */
async function attempt(kind: Kind, { c, slug, actor, form: f }: Ctx, formErrors: Map<string, string>): Promise<Record<string, string>> {
  const version = str(f, 'version') || undefined;
  const input = kind === 'dish' ? dishInput(f, formErrors) : wineInput(f, formErrors);
  // a field the form already knows is wrong (not a number) must not let the others be saved: check them, write nothing
  const opts = { identityConfirmed: str(f, 'confirmIdentity') === 'true', validateOnly: formErrors.size > 0 };
  try {
    const done = kind === 'dish'
      ? await c.catalogEditService.updateDish(slug, str(f, 'dishId'), input, actor, version, opts)
      : await c.catalogEditService.updateWine(slug, str(f, 'wineId'), input, actor, version, opts);
    if (opts.validateOnly) return { invalid: '{}' };
    return { saved: done.changed ? 'catalog_saved' : 'catalog_unchanged', n: done.staleLocales.join(',') };
  } catch (e) {
    const d = domainError(e);
    if (d?.code === 'validation_failed') return { invalid: JSON.stringify(d.fields ?? {}) };
    throw e;
  }
}

/** The answer to the post: the form's state for a mistake, a redirect for a success. */
function conclude(kind: Kind, form: FormData, result: Performed, formErrors: Map<string, string>): DetailsState {
  const slug = str(form, 'slug');
  const names = kind === 'dish' ? DISH_TEXT : WINE_TEXT;
  const shown = values(form, names, { ...(kind === 'wine' ? { pouredByGlass: String(form.getAll('pouredByGlass').map(String).includes('true')) } : {}), confirmIdentity: String(str(form, 'confirmIdentity') === 'true') });
  if (result === 'signed-out') redirect(`/admin/login?next=${encodeURIComponent(safeBack(slug, str(form, 'back')))}`);
  const { back, flash } = result;
  if (flash.invalid !== undefined) {
    const fields = formFields(JSON.parse(flash.invalid) as Record<string, string>, formErrors, ['price', 'bottlePrice', 'glassPrice', 'vintage', 'listNumber']);
    return { status: 'error', fields, values: shown };
  }
  if (flash.error) return { status: 'error', error: flash.error, fields: {}, values: shown };
  revalidatePath(`/admin/${slug}`, 'layout');
  const { n, ...rest } = flash;
  redirect(withFlash(back, n ? { ...rest, n } : rest));
}

/** A3 "Details": name, description, category and price of a dish. */
export async function saveDishDetails(_previous: DetailsState, form: FormData): Promise<DetailsState> {
  const formErrors = new Map<string, string>();
  const result = await perform(form, 'catalog.edit', (ctx) => attempt('dish', ctx, formErrors));
  return conclude('dish', form, result, formErrors);
}

/** A5 "Listing": producer, name, vintage, region, country, note, list number, bottle and glass price. */
export async function saveWineDetails(_previous: DetailsState, form: FormData): Promise<DetailsState> {
  const formErrors = new Map<string, string>();
  const result = await perform(form, 'catalog.edit', (ctx) => attempt('wine', ctx, formErrors));
  return conclude('wine', form, result, formErrors);
}
