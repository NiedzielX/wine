import { Badge, Button, Input, Label, buttonVariants } from '@wine-match/ui';
import type { Locale } from '@wine-match/core';
import type { Dictionary } from '@/i18n/en';
import type { RoiFieldView } from '@/server/showcase-roi';

const GROUPS = [
  { id: 'restaurant', keys: ['customers', 'attachRate', 'wineSpend', 'margin'] },
  { id: 'assumptions', keys: ['attachChange', 'spendChange', 'planPrice'] }
] as const;

/**
 * The inputs as a plain GET form (R4): works without JavaScript, every field has a label, its unit, its default and where the
 * number comes from. `lang` rides along only when it was chosen explicitly. A text field with a pattern, not `type=number`:
 * the Polish comma and a minus must reach the server as typed.
 */
export function RoiForm({ fields, t, lang, resetHref, summaryHref }: { fields: RoiFieldView[]; t: Dictionary; lang?: Locale; resetHref: string; summaryHref: string }) {
  const r = t.showcase.roi;
  return (
    <form method="get" action="/demo/roi#result" className="grid min-w-0 gap-6" data-roi-form>
      {lang && <input type="hidden" name="lang" value={lang} />}
      {GROUPS.map((g) => (
        <fieldset key={g.id} className="grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4">
          <legend className="px-1 font-serif text-lg">{r.groups[g.id].title}</legend>
          <p className="text-sm text-muted-foreground">{r.groups[g.id].hint}</p>
          {g.keys.map((key) => {
            const f = fields.find((x) => x.key === key)!;
            return (
              <div key={f.key} data-field={f.key} data-origin={f.origin} className="grid min-w-0 gap-1.5">
                <Label htmlFor={`f-${f.key}`}>{f.label} ({f.symbol})</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`f-${f.key}`}
                    name={f.key}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    pattern="-?[0-9]+([.,][0-9]+)?"
                    defaultValue={f.inputValue}
                    aria-describedby={`f-${f.key}-help f-${f.key}-origin`}
                    className="max-w-40 tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">{f.unitText}</span>
                </div>
                <p id={`f-${f.key}-help`} className="text-xs text-muted-foreground">{f.help}</p>
                <p id={`f-${f.key}-origin`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Badge variant={f.origin === 'own' ? 'default' : 'secondary'} className="whitespace-normal">{f.originText}</Badge>
                  <span>{r.default(f.defaultText)}</span>
                </p>
              </div>
            );
          })}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{r.actions.submit}</Button>
        <a href={resetHref} className={buttonVariants({ variant: 'outline' })}>{r.actions.reset}</a>
        <a href={summaryHref} data-summary-link className={buttonVariants({ variant: 'secondary' })}>{r.actions.summary}</a>
      </div>
    </form>
  );
}
