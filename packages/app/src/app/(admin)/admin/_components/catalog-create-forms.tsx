'use client';

import { Button, Input, NativeSelect, NativeSelectOption, Textarea } from '@wine-match/ui';
import Link from 'next/link';
import type { DetailsState } from '../[slug]/catalog-actions';
import { Field, GRID, Top, describedBy, useForm, type CatalogFormLabels } from './catalog-forms';

/**
 * The A32 forms "Add dish" and "Add wine" (spec 2026-11-16-catalog-field-editing, R8, R11): the controls of the A3 "Details" and A5
 * "Listing" forms, blank, plus the style and grape that only feed the draft taste profile. Same state handling: a refused post
 * comes back with what was typed and a message at each field, with or without JavaScript. Props are plain data.
 */

export interface CreateLabels extends CatalogFormLabels {
  cancelHref: string;
  cancel: string;
}

export interface CreateDishProps {
  action: (previous: DetailsState, form: FormData) => Promise<DetailsState>;
  slug: string;
  back: string;
  categories: Array<[string, string]>;
  text: { name: string; description: string; category: string; price: string; renameHint: string };
  labels: CreateLabels;
}

export function CreateDishForm({ action, slug, back, categories, text, labels }: CreateDishProps) {
  const { state, formAction, pending, values, fields } = useForm(action, { name: '', description: '', category: categories[0]?.[0] ?? 'Mains', price: '' });
  const err = (k: string) => (fields[k] ? labels.errors[fields[k]] ?? labels.errors.invalid : undefined);
  const attrs = (k: string, hint?: string) => ({ id: `dish-${k}`, name: k, 'aria-invalid': err(k) ? (true as const) : undefined, 'aria-describedby': describedBy(`dish-${k}`, err(k), hint) });
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      <Top state={state} labels={labels} kind="dish" fields={fields} />
      <div className={GRID}>
        <Field id="dish-name" label={text.name} error={err('name')} hint={labels.baseHint} className="sm:col-span-2">
          <Input {...attrs('name', labels.baseHint)} defaultValue={values.name} maxLength={400} autoComplete="off" />
        </Field>
        <Field id="dish-description" label={text.description} error={err('description')} hint={labels.baseHint} className="sm:col-span-2">
          <Textarea {...attrs('description', labels.baseHint)} defaultValue={values.description} rows={4} />
        </Field>
        <Field id="dish-category" label={text.category} error={err('category')}>
          <NativeSelect id="dish-category" name="category" defaultValue={values.category} className="w-full" aria-invalid={err('category') ? true : undefined}>
            {categories.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field id="dish-price" label={text.price} error={err('price')}>
          <Input {...attrs('price')} defaultValue={values.price} inputMode="decimal" autoComplete="off" className="tabular-nums" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{labels.save}</Button>
        <Button asChild variant="ghost"><Link href={labels.cancelHref}>{labels.cancel}</Link></Button>
      </div>
    </form>
  );
}

export interface CreateWineProps {
  action: (previous: DetailsState, form: FormData) => Promise<DetailsState>;
  slug: string;
  back: string;
  styles: Array<[string, string]>;
  text: {
    producer: string; name: string; vintage: string; region: string; country: string; tastingNote: string; listNumber: string; listNumberHint: string;
    bottlePrice: string; pouredByGlass: string; glassPrice: string; glassHint: string; style: string; grape: string; grapeHint: string;
  };
  labels: CreateLabels;
}

export function CreateWineForm({ action, slug, back, styles, text, labels }: CreateWineProps) {
  const { state, formAction, pending, values, fields } = useForm(action, {
    producer: '', name: '', vintage: '', region: '', country: '', tastingNote: '', listNumber: '', bottlePrice: '', glassPrice: '', pouredByGlass: 'false', style: styles[0]?.[0] ?? 'white', grape: ''
  });
  const err = (k: string) => (fields[k] ? labels.errors[fields[k]] ?? labels.errors.invalid : undefined);
  const attrs = (k: string, hint?: string) => ({ id: `wine-${k}`, name: k, 'aria-invalid': err(k) ? (true as const) : undefined, 'aria-describedby': describedBy(`wine-${k}`, err(k), hint) });
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="back" value={back} />
      <Top state={state} labels={labels} kind="wine" fields={fields} />
      <div className={GRID}>
        <Field id="wine-producer" label={text.producer} error={err('producer')}><Input {...attrs('producer')} defaultValue={values.producer} autoComplete="off" /></Field>
        <Field id="wine-name" label={text.name} error={err('name')}><Input {...attrs('name')} defaultValue={values.name} autoComplete="off" /></Field>
        <Field id="wine-vintage" label={text.vintage} error={err('vintage')}><Input {...attrs('vintage')} defaultValue={values.vintage} autoComplete="off" /></Field>
        <Field id="wine-listNumber" label={text.listNumber} error={err('listNumber')} hint={text.listNumberHint}><Input {...attrs('listNumber', text.listNumberHint)} defaultValue={values.listNumber} inputMode="numeric" autoComplete="off" /></Field>
        <Field id="wine-style" label={text.style} error={err('style')}>
          <NativeSelect id="wine-style" name="style" defaultValue={values.style} className="w-full" aria-invalid={err('style') ? true : undefined}>
            {styles.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        <Field id="wine-grape" label={text.grape} error={err('grape')} hint={text.grapeHint}><Input {...attrs('grape', text.grapeHint)} defaultValue={values.grape} autoComplete="off" /></Field>
        <Field id="wine-region" label={text.region} error={err('region')}><Input {...attrs('region')} defaultValue={values.region} autoComplete="off" /></Field>
        <Field id="wine-country" label={text.country} error={err('country')}><Input {...attrs('country')} defaultValue={values.country} autoComplete="off" /></Field>
        <Field id="wine-tastingNote" label={text.tastingNote} error={err('tastingNote')} className="sm:col-span-2">
          <Textarea {...attrs('tastingNote')} defaultValue={values.tastingNote} rows={4} />
        </Field>
        <Field id="wine-bottlePrice" label={text.bottlePrice} error={err('bottlePrice')}><Input {...attrs('bottlePrice')} defaultValue={values.bottlePrice} inputMode="decimal" autoComplete="off" className="tabular-nums" /></Field>
        <div className="grid min-w-0 content-start gap-3">
          {/* a hidden "false" before the checkbox: an unticked box still sends its state, the last value of the name wins */}
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
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{labels.save}</Button>
        <Button asChild variant="ghost"><Link href={labels.cancelHref}>{labels.cancel}</Link></Button>
      </div>
    </form>
  );
}
