import {
  COOKING_METHODS, PROTEIN_TYPES, WINE_STYLES, styleLabel, type DishPreview, type Locale, type PreviewRow, type WinePreview
} from '@wine-match/core';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, NativeSelect, NativeSelectOption, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';
import { Hidden } from './action-form';
import { ReadOnlyNotice } from './flash';
import { PairingStatusBadge } from './badges';

type Action = (formData: FormData) => void | Promise<void>;

export const DISH_SCALE_KEYS = ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess'] as const;
export const WINE_SCALE_KEYS = ['body', 'acidity', 'tannin', 'sweetness', 'fruitiness', 'oak', 'aromatic', 'freshness'] as const;

/** The values the form shows: the saved profile, or the candidate of the last preview (names are the scales' names). */
export type ProfileValues = Record<string, string | number | boolean>;

interface Props {
  kind: 'dish' | 'wine';
  t: Dictionary;
  locale: Locale;
  slug: string;
  subjectId: string;
  /** the page path (the preview form is a GET to it) */
  path: string;
  canEdit: boolean;
  /** the values in the form */
  values: ProfileValues;
  /** the fingerprint of the stored profile the page was rendered from */
  version: string;
  state: { confirmed: boolean; source: string; by: string | null; at: string | null };
  preview: DishPreview | WinePreview | null;
  /** the candidate in the URL was not valid */
  previewInvalid: boolean;
  actions: { save: Action; confirm: Action };
}

const FIELD = 'grid gap-1.5';

function Select({ id, name, value, options }: { id: string; name: string; value: string | number | boolean; options: Array<[string | number, string]> }) {
  return (
    <NativeSelect id={id} name={name} defaultValue={String(value)} className="w-full">
      {options.map(([v, label]) => <NativeSelectOption key={String(v)} value={String(v)}>{label}</NativeSelectOption>)}
    </NativeSelect>
  );
}

/** Whole-number scale options 0 to 5. */
const LEVELS: Array<[number, string]> = [0, 1, 2, 3, 4, 5].map((n) => [n, String(n)]);

function PreviewTable({ rows, kind, t }: { rows: PreviewRow[]; kind: 'dish' | 'wine'; t: Dictionary }) {
  const m = t.admin.profileEditor;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{kind === 'dish' ? m.colWine : m.colDish}</TableHead>
            <TableHead>{m.colScore}</TableHead>
            <TableHead>{m.colDecision}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.otherId}>
              <TableCell className="font-medium">{r.otherName}</TableCell>
              <TableCell className="tabular-nums">{m.change(r.before, r.after, r.delta)}</TableCell>
              <TableCell>{r.pairing ? <PairingStatusBadge status={r.pairing.status} t={t} /> : <span className="text-muted-foreground">{m.noDecision}</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PreviewSection({ preview, kind, t }: { preview: DishPreview | WinePreview; kind: 'dish' | 'wine'; t: Dictionary }) {
  const m = t.admin.profileEditor;
  const s = preview.summary;
  return (
    <section aria-labelledby="profile-preview-title" className="mt-6 grid gap-4" id="profile-preview">
      <div>
        <h3 id="profile-preview-title" className="font-heading text-base font-semibold">{m.previewTitle}</h3>
        <p className="text-sm text-muted-foreground">{kind === 'dish' ? m.previewTextDish : m.previewTextWine}</p>
      </div>
      {preview.unpublishedPairings > 0 && <p className="text-xs text-muted-foreground">{m.unpublished(preview.unpublishedPairings)}</p>}
      <p className="text-sm font-medium" role="status">
        {s.changedRows === 0 ? m.noChange : s.changedPairs === 0 ? m.noPairsChange : m.summary(s.changedPairs, s.crossingPairs)}
      </p>
      <PreviewTable rows={preview.rows} kind={kind} t={t} />
      {preview.kind === 'dish' && (
        <div className="grid gap-4 md:grid-cols-2">
          {([['guestBefore', preview.guest.before], ['guestAfter', preview.guest.after]] as const).map(([key, list]) => (
            <div key={key}>
              <h4 className="mb-1.5 text-sm font-medium">{m[key]}</h4>
              <ol className="grid gap-1 text-sm">
                {list.map((x, i) => <li key={x.id} className="flex justify-between gap-3"><span>{i + 1}. {x.name}</span><span className="tabular-nums text-muted-foreground">{x.matchScore}</span></li>)}
              </ol>
            </div>
          ))}
        </div>
      )}
      {preview.kind === 'wine' && (
        <div>
          <h4 className="mb-1.5 text-sm font-medium">{m.guestWineTitle}</h4>
          {preview.guest.length === 0
            ? <p className="text-sm text-muted-foreground">{m.guestWineNone}</p>
            : <ul className="grid gap-1 text-sm">{preview.guest.map((g) => <li key={g.dishId} className="flex flex-wrap justify-between gap-x-3"><span>{g.dishName}</span><span className="text-muted-foreground">{m.guestRank(g.before, g.after)}</span></li>)}</ul>}
        </div>
      )}
    </section>
  );
}

/**
 * The "Edit taste profile" card of A3 (dish) and A5 (wine) (spec 2026-11-04-panel-completion, R3 to R7). Two plain
 * forms, so it all works without JavaScript: a GET form with the scales ("Show how the match changes" renders the
 * preview on the server from the URL), and a POST form that saves exactly the values shown (hidden copies), as a
 * confirmed profile or a draft. The fingerprint of the stored profile travels as `version` (a stale form is a conflict).
 */
export function ProfileEditor({ kind, t, locale, slug, subjectId, path, canEdit, values, version, state, preview, previewInvalid, actions }: Props) {
  const m = t.admin.profileEditor;
  const idKey = kind === 'dish' ? 'dishId' : 'wineId';
  const keys = kind === 'dish' ? DISH_SCALE_KEYS : WINE_SCALE_KEYS;
  const labels = kind === 'dish' ? t.admin.dish.scales : t.admin.wine.scales;
  const label = (k: string) => (labels as Record<string, string>)[k] ?? k;
  const fields: Array<{ name: string; node: React.ReactNode }> = [];
  for (const k of keys) {
    fields.push({ name: k, node: <Select id={`pf-${k}`} name={k} value={values[k] ?? 0} options={LEVELS} /> });
  }
  const extra: Array<{ name: string; label: string; node: React.ReactNode }> = kind === 'dish'
    ? [
      { name: 'protein', label: m.protein, node: <Select id="pf-protein" name="protein" value={values.protein ?? ''} options={PROTEIN_TYPES.map((p) => [p, t.admin.proteins[p]])} /> },
      { name: 'cooking', label: m.cooking, node: <Select id="pf-cooking" name="cooking" value={values.cooking ?? ''} options={COOKING_METHODS.map((c) => [c, t.admin.cooking[c]])} /> }
    ]
    : [
      { name: 'alcohol', label: m.alcohol, node: <Input id="pf-alcohol" name="alcohol" type="number" inputMode="decimal" min={0} max={25} step={0.1} defaultValue={String(values.alcohol ?? '')} /> },
      { name: 'style', label: m.style, node: <Select id="pf-style" name="style" value={values.style ?? ''} options={WINE_STYLES.map((s) => [s, styleLabel(s, locale)])} /> },
      { name: 'adventurous', label: m.adventurous, node: <Select id="pf-adventurous" name="adventurous" value={values.adventurous ?? false} options={[['false', m.no], ['true', m.yes]]} /> }
    ];
  const text = kind === 'dish' ? m.textDish : m.textWine;
  const sourceText = m.sources[state.source] ?? state.source;

  return (
    <Card className="lg:col-span-2" id="profile-editor">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{m.title}</CardTitle>
          <Badge className={state.confirmed ? 'bg-sage-soft text-sage' : 'bg-brass-soft text-brass'}>{state.confirmed ? m.stateConfirmed : m.stateDraft}</Badge>
        </div>
        <CardDescription>{text} {m.afterPublish}</CardDescription>
        <p className="text-sm" data-testid="profile-state">{state.confirmed ? m.stateConfirmedText(state.by, state.at) : m.stateDraftText(sourceText)}</p>
      </CardHeader>
      <CardContent>
        {!canEdit && <ReadOnlyNotice>{m.readOnly}</ReadOnlyNotice>}
        {canEdit && (
          <>
            <form method="get" action={`${path}#profile-preview`} className="grid gap-5" aria-label={m.title}>
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.name} className={FIELD}>
                    <Label htmlFor={`pf-${f.name}`}>{m.scale(label(f.name))}</Label>
                    {f.node}
                  </div>
                ))}
                {extra.map((f) => (
                  <div key={f.name} className={FIELD}>
                    <Label htmlFor={`pf-${f.name}`}>{f.label}</Label>
                    {f.node}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit">{m.showPreview}</Button>
                {preview || previewInvalid ? <Button asChild variant="ghost"><a href={`${path}#profile-editor`}>{m.reset}</a></Button> : null}
              </div>
            </form>
            {previewInvalid && (
              <Alert variant="destructive" className="mt-5" role="alert">
                <AlertTitle>{m.error}</AlertTitle>
                <AlertDescription>{m.invalid}</AlertDescription>
              </Alert>
            )}
            {preview && <PreviewSection preview={preview} kind={kind} t={t} />}
            {!previewInvalid && (
              <div className="mt-6 grid gap-3 border-t pt-5">
                <p className="text-sm text-muted-foreground">{m.saveText}</p>
                <div className="flex flex-wrap gap-3">
                  <form action={actions.save}>
                    <Hidden fields={{ slug, back: `${path}`, [idKey]: subjectId, version, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])) }} />
                    <input type="hidden" name="confirm" value="true" />
                    <Button type="submit">{m.saveConfirm}</Button>
                  </form>
                  <form action={actions.save}>
                    <Hidden fields={{ slug, back: `${path}`, [idKey]: subjectId, version, ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])) }} />
                    <input type="hidden" name="confirm" value="false" />
                    <Button type="submit" variant="outline">{m.saveDraft}</Button>
                  </form>
                  {!state.confirmed && (
                    <form action={actions.confirm}>
                      <Hidden fields={{ slug, back: `${path}`, [idKey]: subjectId, version }} />
                      <Button type="submit" variant="outline">{m.confirmOnly}</Button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

