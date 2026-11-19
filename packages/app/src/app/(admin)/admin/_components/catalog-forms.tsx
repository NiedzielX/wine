'use client';

import { Alert, AlertDescription, Button, Input, Label, NativeSelect, NativeSelectOption, Textarea } from '@wine-match/ui';
import { useActionState, type ReactNode } from 'react';
import type { DetailsState } from '../[slug]/catalog-actions';

/**
 * The A3 "Details" and A5 "Listing" forms (spec 2026-11-16-catalog-field-editing, R11). `useActionState` lets the server
 * render a refused post into the response, so a form without JavaScript comes back with what was typed and a message at
 * each field (`aria-invalid`, `aria-describedby`). A success is a redirect, so these forms only ever show a mistake. Props
 * are plain data (texts with `{n}` / `{languages}` placeholders, never functions: a client component cannot take them).
 */

export interface CatalogFormLabels {
  save: string;
  /** the hint under the name and description: "This is the base text. Translations are below." */
  baseHint: string;
  errors: Record<string, string>;
  formErrors: Record<string, string>;
  /** "Last edited by …" (already filled in by the server) or null */
  lastEdit: string | null;
  /** "Translations (EN) may be outdated." (already filled in) or null */
  stale: string | null;
  staleLink: string;
  /** the warning about sommelier pairings with `{n}` filled in, or null when there are none */
  identityWarning: string | null;
  identityConfirm: string;
  identityChecked: boolean;
}

const GRID = 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]';

type FormState = DetailsState;
const IDLE: FormState = { status: 'idle' };

function useForm(action: (previous: DetailsState, form: FormData) => Promise<DetailsState>, initial: Record<string, string>) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const failed = state.status === 'error';
  const values = failed ? { ...initial, ...state.values } : initial;
  const fields = failed ? state.fields : {};
  return { state, formAction, pending, values, fields };
}

function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`grid min-w-0 content-start gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

const describedBy = (id: string, error: string | undefined, hint: string | undefined) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

function Top({ state, labels, kind, fields }: { state: FormState; labels: CatalogFormLabels; kind: 'dish' | 'wine'; fields: Record<string, string> }) {
  const code = state.status === 'error' ? (state.error ?? (Object.keys(fields).length ? 'validation_failed' : 'unexpected')) : null;
  const text = code === null ? null : code === 'version_conflict' ? labels.formErrors[`version_conflict_${kind}`] : (labels.formErrors[code] ?? labels.formErrors.unexpected);
  return (
    <>
      {text && <Alert variant="destructive" role="alert"><AlertDescription>{text}</AlertDescription></Alert>}
      {labels.stale && <p className="text-sm text-muted-foreground" data-stale-translations>{labels.stale}{' '}<a href="#translations" className="underline underline-offset-4">{labels.staleLink}</a></p>}
    </>
  );
}

function Footer({ labels, pending }: { labels: CatalogFormLabels; pending: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button type="submit" disabled={pending}>{labels.save}</Button>
      {labels.lastEdit && <p className="text-sm text-muted-foreground" data-last-edit>{labels.lastEdit}</p>}
    </div>
  );
}

function Identity({ labels, values }: { labels: CatalogFormLabels; values: Record<string, string> }) {
  if (!labels.identityWarning) return null;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm sm:col-span-2" data-identity-warning>
      <p>{labels.identityWarning}</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="confirmIdentity" value="true" defaultChecked={values.confirmIdentity === 'true' || labels.identityChecked} className="size-4" />
        <span>{labels.identityConfirm}</span>
      </label>
    </div>
  );
}

export interface DishFormProps {
  action: (previous: DetailsState, form: FormData) => Promise<DetailsState>;
  slug: string;
  back: string;
  dishId: string;
  version: string;
  initial: { name: string; description: string; category: string; price: string };
  categories: Array<[string, string]>;
  text: { name: string; description: string; category: string; price: string; renameHint: string };
  labels: CatalogFormLabels;
}

export function DishDetailsForm({ action, slug, back, dishId, version, initial, categories, text, labels }: DishFormProps) {
  const { state, formAction, pending, values, fields } = useForm(action, initial);
  const err = (k: string) => (fields[k] ? labels.errors[fields[k]] ?? labels.errors.invalid : undefined);
  const field = (k: 'name' | 'description' | 'price', hint?: string) => ({
    id: `dish-${k}`, name: k, 'aria-invalid': err(k) ? (true as const) : undefined, 'aria-describedby': describedBy(`dish-${k}`, err(k), hint)
  });
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="dishId" value={dishId} />
      <input type="hidden" name="version" value={version} />
      <Top state={state} labels={labels} kind="dish" fields={fields} />
      <div className={GRID}>
        <Field id="dish-name" label={text.name} error={err('name')} hint={`${labels.baseHint} ${text.renameHint}`} className="sm:col-span-2">
          <Input {...field('name', `${labels.baseHint} ${text.renameHint}`)} defaultValue={values.name} maxLength={400} autoComplete="off" />
        </Field>
        <Identity labels={labels} values={values} />
        <Field id="dish-description" label={text.description} error={err('description')} hint={labels.baseHint} className="sm:col-span-2">
          <Textarea {...field('description', labels.baseHint)} defaultValue={values.description} rows={4} />
        </Field>
        <Field id="dish-category" label={text.category} error={err('category')}>
          <NativeSelect id="dish-category" name="category" defaultValue={values.category} className="w-full" aria-invalid={err('category') ? true : undefined}>
            {categories.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field id="dish-price" label={text.price} error={err('price')}>
          <Input {...field('price')} defaultValue={values.price} inputMode="decimal" autoComplete="off" className="tabular-nums" />
        </Field>
      </div>
      <Footer labels={labels} pending={pending} />
    </form>
  );
}

export interface WineFormProps {
  action: (previous: DetailsState, form: FormData) => Promise<DetailsState>;
  slug: string;
  back: string;
  wineId: string;
  version: string;
  initial: { producer: string; name: string; vintage: string; region: string; country: string; tastingNote: string; listNumber: string; bottlePrice: string; glassPrice: string; pouredByGlass: string };
  text: {
    producer: string; name: string; vintage: string; region: string; country: string; tastingNote: string; listNumber: string; listNumberHint: string;
    bottlePrice: string; pouredByGlass: string; glassPrice: string; glassHint: string;
  };
  labels: CatalogFormLabels;
}

export function WineListingForm({ action, slug, back, wineId, version, initial, text, labels }: WineFormProps) {
  const { state, formAction, pending, values, fields } = useForm(action, initial);
  const err = (k: string) => (fields[k] ? labels.errors[fields[k]] ?? labels.errors.invalid : undefined);
  const attrs = (k: string, hint?: string) => ({ id: `wine-${k}`, name: k, 'aria-invalid': err(k) ? (true as const) : undefined, 'aria-describedby': describedBy(`wine-${k}`, err(k), hint) });
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="wineId" value={wineId} />
      <input type="hidden" name="version" value={version} />
      <Top state={state} labels={labels} kind="wine" fields={fields} />
      <div className={GRID}>
        <Field id="wine-producer" label={text.producer} error={err('producer')}><Input {...attrs('producer')} defaultValue={values.producer} autoComplete="off" /></Field>
        <Field id="wine-name" label={text.name} error={err('name')}><Input {...attrs('name')} defaultValue={values.name} autoComplete="off" /></Field>
        <Field id="wine-vintage" label={text.vintage} error={err('vintage')}><Input {...attrs('vintage')} defaultValue={values.vintage} autoComplete="off" /></Field>
        <Field id="wine-listNumber" label={text.listNumber} error={err('listNumber')} hint={text.listNumberHint}><Input {...attrs('listNumber', text.listNumberHint)} defaultValue={values.listNumber} inputMode="numeric" autoComplete="off" /></Field>
        <Identity labels={labels} values={values} />
        <Field id="wine-region" label={text.region} error={err('region')} hint={labels.baseHint}><Input {...attrs('region', labels.baseHint)} defaultValue={values.region} autoComplete="off" /></Field>
        <Field id="wine-country" label={text.country} error={err('country')} hint={labels.baseHint}><Input {...attrs('country', labels.baseHint)} defaultValue={values.country} autoComplete="off" /></Field>
        <Field id="wine-tastingNote" label={text.tastingNote} error={err('tastingNote')} hint={labels.baseHint} className="sm:col-span-2">
          <Textarea {...attrs('tastingNote', labels.baseHint)} defaultValue={values.tastingNote} rows={4} />
        </Field>
        <Field id="wine-bottlePrice" label={text.bottlePrice} error={err('bottlePrice')}><Input {...attrs('bottlePrice')} defaultValue={values.bottlePrice} inputMode="decimal" autoComplete="off" className="tabular-nums" /></Field>
        <div className="grid min-w-0 content-start gap-3">
          {/* a hidden "false" before the checkbox: an unticked box still sends its state (R11, W5), the last value of the name wins */}
          <input type="hidden" name="pouredByGlass" value="false" />
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="pouredByGlass" value="true" defaultChecked={values.pouredByGlass === 'true'} className="size-4" />
            <span>{text.pouredByGlass}</span>
          </label>
          <Field id="wine-glassPrice" label={text.glassPrice} error={err('glassPrice')} hint={text.glassHint}>
            <Input {...attrs('glassPrice', text.glassHint)} defaultValue={values.glassPrice} inputMode="decimal" autoComplete="off" className="tabular-nums" />
          </Field>
        </div>
      </div>
      <Footer labels={labels} pending={pending} />
    </form>
  );
}
