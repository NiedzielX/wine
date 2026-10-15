import type { ImportJob, ImportKind, ImportRow } from '@wine-match/core';
import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, NativeSelect, NativeSelectOption } from '@wine-match/ui';
import Link from 'next/link';
import { cancelImport, confirmImport, saveImportRows, uploadImport } from '../[slug]/import-actions';
import { Hidden } from './action-form';
import { formatDateTime } from './format';

/** Shared by the two import screens (A8 menu, A9 wine list). Pure presentation: the checks live in @wine-match/core. */

const LABEL = {
  menu: { title: 'Import menu', noun: 'dishes', one: 'dish', sample: 'menu.csv', columns: 'Category, Name, Description, Price', hint: 'New dishes arrive as drafts with a draft taste profile. They go live when you publish.' },
  wines: { title: 'Import wine list', noun: 'wines', one: 'wine', sample: 'wines.csv', columns: 'Producer, Wine, Vintage, Region, Grape, Style, Glass price, Bottle price', hint: 'New wines are on your list at once and get engine pairing suggestions for your review.' }
} as const;

const COLUMNS: Record<ImportKind, Array<{ key: string; label: string; width: string; kind?: 'category' | 'style' | 'price' }>> = {
  menu: [
    { key: 'category', label: 'Category', width: 'w-32', kind: 'category' }, { key: 'name', label: 'Name', width: 'w-56' },
    { key: 'description', label: 'Description', width: 'w-72' }, { key: 'price', label: 'Price (zł)', width: 'w-24', kind: 'price' }
  ],
  wines: [
    { key: 'producer', label: 'Producer', width: 'w-44' }, { key: 'name', label: 'Wine', width: 'w-48' }, { key: 'vintage', label: 'Vintage', width: 'w-20' },
    { key: 'region', label: 'Region', width: 'w-36' }, { key: 'country', label: 'Country', width: 'w-28' }, { key: 'grape', label: 'Grape', width: 'w-36' },
    { key: 'style', label: 'Style', width: 'w-32', kind: 'style' }, { key: 'glassPrice', label: 'Glass', width: 'w-20', kind: 'price' }, { key: 'bottlePrice', label: 'Bottle', width: 'w-24', kind: 'price' }
  ]
};

const STYLES = [['sparkling', 'Sparkling'], ['white', 'White'], ['rose', 'Rosé'], ['orange', 'Orange'], ['red', 'Red'], ['sweet', 'Sweet']] as const;

const hasError = (r: ImportRow) => r.issues.some((i) => i.level === 'error');

export function UploadStep({ slug, kind, recent, back }: { slug: string; kind: ImportKind; recent: ImportJob[]; back: string }) {
  const l = LABEL[kind];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader><CardTitle>1. Upload a file</CardTitle><CardDescription>CSV, Excel (.xlsx) or PDF, up to 10 MB. Nothing is saved until you confirm.</CardDescription></CardHeader>
        <CardContent>
          <form action={uploadImport} className="grid gap-4">
            <Hidden fields={{ slug, back, kind }} />
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">File</span>
              <Input type="file" name="file" required accept=".csv,.tsv,.txt,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
            </label>
            <div><Button type="submit">Upload and check</Button></div>
          </form>
          <p className="mt-5 text-sm text-muted-foreground">{l.hint}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>What the file should look like</CardTitle><CardDescription>The first row names the columns. English or Polish names both work.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><b className="font-medium">Columns:</b> {l.columns}</p>
          <p className="text-muted-foreground">Prices like <code>58,50</code> and <code>58.50 zł</code> are fine. PDFs are read as text and are less precise: check every row.</p>
          <p><Link className="underline underline-offset-4" href={`/api/v1/import-samples/${kind}`}>Download a sample CSV</Link></p>
        </CardContent>
      </Card>
      {recent.length > 0 && (
        <Card className="gap-0 py-0 lg:col-span-2">
          <CardHeader className="border-b py-4"><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent className="px-0">
            {recent.map((j) => (
              <div key={j.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-6 py-3 text-sm last:border-b-0">
                <div className="min-w-0">
                  <b className="font-medium">{j.fileName}</b>
                  <div className="text-xs text-muted-foreground">{formatDateTime(j.createdAt)} · {j.createdBy}{j.result ? ` · ${j.result.created} new, ${j.result.updated} updated` : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={j.status} />
                  {j.status === 'preview_ready' && <Button asChild size="sm" variant="outline"><Link href={`/admin/${slug}/import/${kind}?job=${j.id}`}>Continue</Link></Button>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ImportJob['status'] }) {
  if (status === 'confirmed') return <Badge className="border-transparent bg-sage-soft text-sage">Imported</Badge>;
  if (status === 'preview_ready') return <Badge className="border-transparent bg-brass-soft text-brass">Waiting for you</Badge>;
  if (status === 'cancelled') return <Badge variant="secondary">Cancelled</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export function PreviewStep({ slug, job, back }: { slug: string; job: ImportJob; back: string }) {
  const l = LABEL[job.kind];
  const cols = COLUMNS[job.kind];
  const ticked = job.rows.filter((r) => r.include).length;
  const errors = job.rows.filter(hasError).length;
  const updates = job.rows.filter((r) => r.action === 'update').length;
  const warnings = job.rows.filter((r) => !hasError(r) && r.issues.some((i) => i.level === 'warning' && !i.code)).length;
  const common = { slug, back, kind: job.kind, job: job.id, rows: job.rows.map((r) => r.rowNumber).join(',') };

  return (
    // min-w-0 on every grid level: a wide table must scroll inside its card, not widen the page
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">{job.fileName}</Badge>
        <span className="text-muted-foreground">{job.rows.length} rows read</span>
        <Badge className="border-transparent bg-sage-soft text-sage">{ticked} will be imported</Badge>
        {errors > 0 && <Badge variant="destructive">{errors} with errors</Badge>}
        {updates > 0 && <Badge variant="secondary">{updates} already exist</Badge>}
        {warnings > 0 && <Badge className="border-transparent bg-brass-soft text-brass">{warnings} to check</Badge>}
      </div>

      {job.notes.map((n) => (
        <Alert key={n} className="border-brass/40 bg-brass-soft text-brass"><AlertDescription className="text-brass">{n}</AlertDescription></Alert>
      ))}

      <form className="grid min-w-0 gap-4">
        <Hidden fields={common} />
        <Card className="min-w-0 gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>2. Check and correct</CardTitle>
            <CardDescription>Fix anything marked in red, untick rows you do not want, then import. Rows that already exist are not ticked; tick one to update it ({job.kind === 'menu' ? 'description, category and price' : 'prices'} only).</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Import</th><th className="px-2 py-2 font-medium">#</th>
                  {cols.map((c) => <th key={c.key} className="px-2 py-2 font-medium">{c.label}</th>)}
                  <th className="px-3 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody>
                {job.rows.map((r) => (
                  <tr key={r.rowNumber} className={`border-t align-top ${r.include ? '' : 'bg-muted/30'}`}>
                    <td className="px-3 py-2"><input type="checkbox" name={`row_${r.rowNumber}_include`} defaultChecked={r.include} aria-label={`Import row ${r.rowNumber}`} className="size-4 accent-primary" /></td>
                    <td className="px-2 py-2 text-muted-foreground tabular-nums">{r.rowNumber}</td>
                    {cols.map((c) => (
                      <td key={c.key} className="px-1.5 py-1.5">
                        <Cell row={r} col={c} />
                      </td>
                    ))}
                    <td className="min-w-64 px-3 py-2">
                      <div className="mb-1">{r.action === 'update' ? <Badge variant="secondary">Update</Badge> : <Badge variant="outline">New</Badge>}</div>
                      {r.issues.length === 0 && <span className="text-xs text-muted-foreground">Looks fine.</span>}
                      <ul className="grid gap-0.5 text-xs">
                        {r.issues.map((i, k) => <li key={k} className={i.level === 'error' ? 'font-medium text-destructive' : 'text-brass'}>{i.level === 'error' ? 'Fix: ' : ''}{i.message}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" formAction={confirmImport} disabled={ticked === 0}>Import {ticked} {ticked === 1 ? l.one : l.noun}</Button>
          <Button type="submit" formAction={saveImportRows} variant="outline">Check again</Button>
          <Button type="submit" formAction={cancelImport} variant="ghost" formNoValidate>Cancel import</Button>
        </div>
      </form>
    </div>
  );
}

function Cell({ row, col }: { row: ImportRow; col: { key: string; width: string; kind?: 'category' | 'style' | 'price' } }) {
  const name = `row_${row.rowNumber}_${col.key}`;
  const value = row.fields[col.key] ?? '';
  const bad = row.issues.some((i) => i.level === 'error' && i.field === col.key);
  const cls = `h-8 px-2 text-sm ${col.width} ${bad ? 'border-destructive ring-1 ring-destructive' : ''}`;
  if (col.kind === 'category') {
    return (
      <NativeSelect name={name} defaultValue={value} aria-label={col.key} className={`h-8 ${col.width}`}>
        {['Starters', 'Mains', 'Desserts'].map((c) => <NativeSelectOption key={c} value={c}>{c}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  if (col.kind === 'style') {
    return (
      <NativeSelect name={name} defaultValue={value} aria-label={col.key} className={`h-8 ${col.width}`}>
        {STYLES.map(([v, label]) => <NativeSelectOption key={v} value={v}>{label}</NativeSelectOption>)}
      </NativeSelect>
    );
  }
  return <Input name={name} defaultValue={value} aria-label={`${col.key}, row ${row.rowNumber}`} aria-invalid={bad || undefined} inputMode={col.kind === 'price' ? 'decimal' : undefined} className={cls} />;
}

export function DoneStep({ slug, job }: { slug: string; job: ImportJob }) {
  const base = `/admin/${slug}`;
  const r = job.result;
  if (job.status === 'cancelled') {
    return <Alert><AlertTitle>This import was cancelled</AlertTitle><AlertDescription>Nothing was changed. <Link className="underline" href={`${base}/import/${job.kind}`}>Start a new one</Link>.</AlertDescription></Alert>;
  }
  return (
    <Card>
      <CardHeader><CardTitle>3. Imported</CardTitle><CardDescription>{job.fileName}, {formatDateTime(job.confirmedAt)} by {job.createdBy}.</CardDescription></CardHeader>
      <CardContent className="grid gap-5">
        {r && (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><dt className="text-sm text-muted-foreground">New</dt><dd className="font-serif text-3xl tabular-nums">{r.created}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Updated</dt><dd className="font-serif text-3xl tabular-nums">{r.updated}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Skipped</dt><dd className="font-serif text-3xl tabular-nums">{r.skipped}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Suggestions</dt><dd className="font-serif text-3xl tabular-nums">{r.suggestions}</dd></div>
          </dl>
        )}
        <p className="text-sm text-muted-foreground">{job.kind === 'menu' ? 'New dishes are drafts: check their taste profiles, review the engine’s pairing suggestions, then publish to show them to guests.' : 'New wines are on your list. Review the engine’s pairing suggestions, then publish.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href={`${base}/review`}>Review suggestions</Link></Button>
          <Button asChild variant="outline"><Link href={job.kind === 'menu' ? `${base}/menu` : `${base}/wines`}>{job.kind === 'menu' ? 'Open the menu' : 'Open the wine list'}</Link></Button>
          <Button asChild variant="outline"><Link href={`${base}/import/${job.kind}`}>Import another file</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}
