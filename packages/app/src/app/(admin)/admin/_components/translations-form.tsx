import { LOCALES, type Locale } from '@wine-match/core';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';
import { Hidden } from './action-form';
import { ReadOnlyNotice } from './flash';

type Action = (formData: FormData) => void | Promise<void>;

export interface TranslationField {
  key: string;
  label: string;
  /** the base text, shown as the placeholder: an empty field means "show the base text" */
  base: string;
  max: number;
  multiline?: boolean;
}

/**
 * The "Translations" card of A3 (dish) and A5 (wine) (spec 2026-10-15-bilingual-content, R6): one column per language,
 * inputs named `<field>_<lang>`, the fingerprint of the stored translations as `version`. A plain form post: works
 * without JavaScript. Roles without `import.manage` see the values read-only (the action checks again on its own).
 */
export function TranslationsCard({ action, hidden, fields, translations, version, canEdit, t, contentLocale }: {
  action: Action;
  hidden: Record<string, string>;
  fields: TranslationField[];
  translations: Partial<Record<Locale, Partial<Record<string, string>>>>;
  version: string;
  canEdit: boolean;
  t: Dictionary;
  contentLocale: Locale;
}) {
  const m = t.admin.translations;
  const names = t.common.languageNames;
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>{m.text} {m.base(names[contentLocale])}. {m.afterPublish}</CardDescription>
      </CardHeader>
      <CardContent>
        {!canEdit && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
        <form action={action} className="grid gap-5">
          <Hidden fields={{ ...hidden, version }} />
          <div className="grid gap-6 md:grid-cols-2">
            {LOCALES.map((l) => (
              <fieldset key={l} lang={l} className="grid min-w-0 content-start gap-3">
                <legend className="mb-1 font-medium">{names[l]}</legend>
                {fields.map((f) => {
                  const id = `${f.key}_${l}`;
                  const value = translations[l]?.[f.key] ?? '';
                  return (
                    <div key={id} className="grid gap-1.5">
                      <Label htmlFor={id}>{m.field(f.label, l.toUpperCase())}</Label>
                      {f.multiline
                        ? <Textarea id={id} name={id} defaultValue={value} placeholder={f.base} maxLength={f.max} readOnly={!canEdit} rows={3} />
                        : <Input id={id} name={id} defaultValue={value} placeholder={f.base} maxLength={f.max} readOnly={!canEdit} />}
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>
          {canEdit && <div><Button type="submit">{m.save}</Button></div>}
        </form>
      </CardContent>
    </Card>
  );
}
