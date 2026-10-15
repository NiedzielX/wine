import { TRANSLATION_FIELDS, WINE_STYLES, styleLabel, type ImportIssue, type ImportJob, type ImportKind, type ImportRow, type Locale } from '@wine-match/core';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, NativeSelect, NativeSelectOption } from '@wine-match/ui';
import Link from 'next/link';
import { cancelImport, confirmImport, saveImportRows, uploadImport } from '../[slug]/import-actions';
import { Hidden } from './action-form';
import type { Dictionary } from '@/i18n/en';
import { formatDateTime } from './format';
import { issueText, noteText } from './messages';

/**
 * Shared by the two import screens (A8 menu, A9 wine list). Pure presentation: the checks live in @wine-match/core.
 * Issues and notes are shown in the dashboard's language by their code (spec 2026-10-15-polish-language, A9);
 * an issue without a code (a job saved before codes existed) or an unknown note keeps its English text.
 */

type Texts = Dictionary['admin']['import'];
type ColumnKey = keyof Texts['columns'];

const COLUMNS: Record<ImportKind, Array<{ key: string; label: ColumnKey; width: string; kind?: 'category' | 'style' | 'price' }>> = {
  menu: [
    { key: 'category', label: 'category', width: 'w-32', kind: 'category' }, { key: 'name', label: 'name', width: 'w-56' },
    { key: 'description', label: 'description', width: 'w-72' }, { key: 'price', label: 'price', width: 'w-24', kind: 'price' }
  ],
  wines: [
    { key: 'producer', label: 'producer', width: 'w-44' }, { key: 'name', label: 'wineName', width: 'w-48' }, { key: 'vintage', label: 'vintage', width: 'w-20' },
    { key: 'region', label: 'region', width: 'w-36' }, { key: 'country', label: 'country', width: 'w-28' }, { key: 'grape', label: 'grape', width: 'w-36' },
    { key: 'style', label: 'style', width: 'w-32', kind: 'style' }, { key: 'glassPrice', label: 'glassPrice', width: 'w-20', kind: 'price' }, { key: 'bottlePrice', label: 'bottlePrice', width: 'w-24', kind: 'price' }
  ]
};

/** The translation columns this file has (spec 2026-10-15-bilingual-content, R5): shown next to the base columns. */
function columnsOf(job: ImportJob) {
  const extra = TRANSLATION_FIELDS[job.kind]
    .filter((k) => job.rows.some((r) => Object.hasOwn(r.fields, k)))
    .map((k) => ({ key: k, label: k as ColumnKey, width: k.startsWith('description') || k.startsWith('tasting_note') ? 'w-72' : 'w-48' }));
  return [...COLUMNS[job.kind], ...extra];
}

const CATEGORIES = ['Starters', 'Mains', 'Desserts'] as const;

const hasError = (r: ImportRow) => r.issues.some((i) => i.level === 'error');
/** "to check": advice that is not about an existing item or a repeat (those have their own counters) */
const isAdvice = (i: ImportIssue) => i.level === 'warning' && i.code !== 'exists' && i.code !== 'duplicate_in_file';

export function UploadStep({ slug, kind, recent, back, locale, t }: { slug: string; kind: ImportKind; recent: ImportJob[]; back: string; locale: Locale; t: Dictionary }) {
  const m = t.admin.import;
  const l = m.kinds[kind];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader><CardTitle>{m.uploadTitle}</CardTitle><CardDescription>{m.uploadText}</CardDescription></CardHeader>
        <CardContent>
          <form action={uploadImport} className="grid gap-4">
            <Hidden fields={{ slug, back, kind }} />
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{m.file}</span>
              <Input type="file" name="file" required accept=".csv,.tsv,.txt,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </label>
            <div><Button type="submit">{m.upload}</Button></div>
          </form>
          <p className="mt-5 text-sm text-muted-foreground">{l.hint}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{m.formatTitle}</CardTitle><CardDescription>{m.formatText}</CardDescription></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><b className="font-medium">{m.columnsLabel}</b> {l.columns}</p>
          <p className="text-muted-foreground">{m.translationsHint}</p>
          <p className="text-muted-foreground">{m.pricesBefore} <code>58,50</code> {m.pricesAnd} <code>58.50 zł</code> {m.pricesAfter}</p>
          <p><Link className="underline underline-offset-4" href={`/api/v1/import-samples/${kind}`}>{m.sample}</Link></p>
        </CardContent>
      </Card>
      {recent.length > 0 && (
        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b py-4"><CardTitle>{m.recent}</CardTitle></CardHeader>
          <CardContent className="px-0">
            {recent.map((j) => (
              <div key={j.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-6 py-3 text-sm last:border-b-0">
                <div className="min-w-0">
                  <b className="font-medium">{j.fileName}</b>
                  <div className="text-xs text-muted-foreground">{formatDateTime(j.createdAt, locale)} · {j.createdBy}{j.result ? ` · ${m.recentResult(j.result.created, j.result.updated)}` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={j.status} t={t} />
                  {j.status === 'preview_ready' && <Button asChild size="sm" variant="outline"><Link href={`/admin/${slug}/import/${kind}?job=${j.id}`}>{m.continue}</Link></Button>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status, t }: { status: ImportJob['status']; t: Dictionary }) {
  const s = t.admin.import.status;
  if (status === 'confirmed') return <Badge className="border-transparent bg-sage-soft text-sage">{s.confirmed}</Badge>;
  if (status === 'preview_ready') return <Badge className="border-transparent bg-brass-soft text-brass">{s.preview_ready}</Badge>;
  if (status === 'cancelled') return <Badge variant="secondary">{s.cancelled}</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function PreviewStep({ slug, job, back, locale, t }: { slug: string; job: ImportJob; back: string; locale: Locale; t: Dictionary }) {
  const m = t.admin.import;
  const l = m.kinds[job.kind];
  const cols = columnsOf(job);
  const ticked = job.rows.filter((r) => r.include).length;
  const errors = job.rows.filter(hasError).length;
  const updates = job.rows.filter((r) => r.action === 'update').length;
  const warnings = job.rows.filter((r) => !hasError(r) && r.issues.some(isAdvice)).length;
  const common = { slug, back, kind: job.kind, job: job.id, rows: job.rows.map((r) => r.rowNumber).join(',') };

  return (
    // min-w-0 on every grid level: a wide table must scroll inside its card, not widen the page
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{job.fileName}</Badge>
        <span className="text-muted-foreground">{m.rowsRead(job.rows.length)}</span>
        <Badge className="border-transparent bg-sage-soft text-sage">{m.willImport(ticked)}</Badge>
        {errors > 0 && <Badge variant="destructive">{m.withErrors(errors)}</Badge>}
        {updates > 0 && <Badge variant="secondary">{m.exist(updates)}</Badge>}
        {warnings > 0 && <Badge className="border-transparent bg-brass-soft text-brass">{m.toCheck(warnings)}</Badge>}
      </div>

      {job.notes.map((n) => (
        <Alert key={n} className="border-brass/40 bg-brass-soft text-brass"><AlertDescription className="text-brass">{noteText(n, t)}</AlertDescription></Alert>
      ))}

      <form className="grid min-w-0 gap-4">
        <Hidden fields={common} />
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>{m.checkTitle}</CardTitle>
            <CardDescription>{m.checkText(l.updates)}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{m.colImport}</th><th className="px-2 py-2 font-medium">#</th>
                  {cols.map((c) => <th key={c.key} className="px-2 py-2 font-medium">{m.columns[c.label]}</th>)}
                  <th className="px-3 py-2 font-medium">{m.colCheck}</th>
                </tr>
              </thead>
              <tbody>
                {job.rows.map((r) => (
                  <tr key={r.rowNumber} className={`border-t align-top ${r.include ? '' : 'bg-muted/30'}`}>
                    <td className="px-3 py-2"><input type="checkbox" name={`row_${r.rowNumber}_include`} defaultChecked={r.include} aria-label={m.importRow(r.rowNumber)} className="size-4 accent-primary" /></td>
                    <td className="px-2 py-2 text-muted-foreground tabular-nums">{r.rowNumber}</td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-1.5 py-1.5">
                        <Cell row={r} col={c} locale={locale} t={t} />
                      </td>
                    ))}
                    <td className="min-w-64 px-3 py-2">
                      <div className="mb-1">{r.action === 'update' ? <Badge variant="secondary">{m.update}</Badge> : <Badge variant="outline">{m.new}</Badge>}</div>
                      {r.issues.length === 0 && <span className="text-xs text-muted-foreground">{m.fine}</span>}
                      <ul className="grid gap-0.5 text-xs">
                        {r.issues.map((i, k) => <li key={k} className={i.level === 'error' ? 'font-medium text-destructive' : 'text-brass'}>{i.level === 'error' ? m.fix : ''}{issueText(i, job.kind, t, locale)}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" formAction={confirmImport} disabled={ticked === 0}>{m.submit(ticked, l.noun(ticked))}</Button>
          <Button type="submit" formAction={saveImportRows} variant="outline">{m.checkAgain}</Button>
          <Button type="submit" formAction={cancelImport} variant="ghost" formNoValidate>{m.cancel}</Button>
        </div>
      </form>
    </div>
  );
}

function Cell({ row, col, locale, t }: { row: ImportRow; col: { key: string; label: ColumnKey; width: string; kind?: 'category' | 'style' | 'price' }; locale: Locale; t: Dictionary }) {
  const label = t.admin.import.columns[col.label];
  const name = `row_${row.rowNumber}_${col.key}`;
  const value = row.fields[col.key] ?? '';
  const bad = row.issues.some((i) => i.level === 'error' && i.field === col.key);
  const cls = `h-8 px-2 text-sm ${col.width} ${bad ? 'border-destructive ring-1 ring-destructive' : ''}`;
  if (col.kind === 'category') {
    return (
      <NativeSelect name={name} defaultValue={value} aria-label={t.admin.import.cellLabel(label, row.rowNumber)} className={`h-8 ${col.width}`}>
        {CATEGORIES.map((c) => <NativeSelectOption key={c} value={c}>{t.admin.categories[c]}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  if (col.kind === 'style') {
    return (
      <NativeSelect name={name} defaultValue={value} aria-label={t.admin.import.cellLabel(label, row.rowNumber)} className={`h-8 ${col.width}`}>
        {WINE_STYLES.map((v) => <NativeSelectOption key={v} value={v}>{styleLabel(v, locale)}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  return <Input name={name} defaultValue={value} aria-label={t.admin.import.cellLabel(label, row.rowNumber)} aria-invalid={bad || undefined} inputMode={col.kind === 'price' ? 'decimal' : undefined} className={cls} />;
}

export function DoneStep({ slug, job, locale, t }: { slug: string; job: ImportJob; locale: Locale; t: Dictionary }) {
  const m = t.admin.import;
  const base = `/admin/${slug}`;
  const r = job.result;
  if (job.status === 'cancelled') {
    return <Alert><AlertTitle>{m.cancelledTitle}</AlertTitle><AlertDescription><span>{m.cancelledText} <Link className="underline" href={`${base}/import/${job.kind}`}>{m.startNew}</Link>.</span></AlertDescription></Alert>;
  }
  return (
    <Card>
      <CardHeader><CardTitle>{m.doneTitle}</CardTitle><CardDescription>{m.doneText(job.fileName, formatDateTime(job.confirmedAt, locale), job.createdBy)}</CardDescription></CardHeader>
      <CardContent className="grid gap-5">
        {r && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="text-sm text-muted-foreground">{m.resultNew}</dt><dd className="font-serif text-3xl tabular-nums">{r.created}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{m.resultUpdated}</dt><dd className="font-serif text-3xl tabular-nums">{r.updated}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{m.resultSkipped}</dt><dd className="font-serif text-3xl tabular-nums">{r.skipped}</dd></div>
            <div><dt className="text-sm text-muted-foreground">{m.resultSuggestions}</dt><dd className="font-serif text-3xl tabular-nums">{r.suggestions}</dd></div>
          </dl>
        )}
        <p className="text-sm text-muted-foreground">{job.kind === 'menu' ? m.doneMenu : m.doneWines}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href={`${base}/review`}>{m.reviewSuggestions}</Link></Button>
          <Button asChild variant="outline"><Link href={job.kind === 'menu' ? `${base}/menu` : `${base}/wines`}>{job.kind === 'menu' ? m.openMenu : m.openWines}</Link></Button>
          <Button asChild variant="outline"><Link href={`${base}/import/${job.kind}`}>{m.another}</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
