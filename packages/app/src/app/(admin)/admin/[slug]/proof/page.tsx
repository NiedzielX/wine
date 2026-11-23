import { PROOF_MAX_WINDOW, PROOF_MIN_FOOD_CHECKS, PROOF_MIN_TRADING_DAYS, proofWindows, serviceDay, type ProofReport, type ProofReportResult, type ProofWindowSummary } from '@wine-match/core';
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorMessage, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { Hidden } from '../../_components/action-form';
import { Page, PageHeader } from '../../_components/admin-shell';
import { Flash } from '../../_components/flash';
import { formatDateTime, formatDay, zl } from '../../_components/format';
import { changeText, percentInterval, percentWhole } from '../../_components/proof-format';
import { setProofLaunchDay } from '../proof-actions';
import { requireAccess } from '@/server/auth';
import { isDomainError } from '@/server/domain-errors';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.proof };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * A33 — the results report (spec 2026-11-18-owner-proof-report, R4 to R9, R15): Wine Attach Rate before (the 28 days before the
 * launch day) and after (28-day windows), with its uncertainty, an honest "not enough data", the checks with and without a code
 * (a correlation, never a cause), the codes of the window and what the report does not say. For owner and general manager
 * (`proof.view`); the Wine Director gets 403. Plain links (`?window=`) and one plain form (the launch day), so everything works
 * without JavaScript. Outside `(lists)`: no `loading.tsx` (it would turn the 403 into a 200 and the page needs no script).
 */
export default async function ProofPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireAccess(slug);
  if (!access.can('proof.view')) forbidden();
  const canManage = access.can('proof.manage');
  const { locale, t } = await getI18n();
  const m = t.admin.proof;
  const c = (await getRequestScope()).cradle;
  const path = `/admin/${slug}/proof`;

  let result: ProofReportResult | null = null;
  try {
    result = await c.proofReportService.getReport(slug, one(sp.window));
  } catch (e) {
    if (!isDomainError(e, 'invalid_window')) throw e;
  }
  if (!result) {
    return (
      <Page>
        <PageHeader title={m.title} description={m.description} />
        <ErrorMessage compact title={m.invalidWindowTitle} message={m.invalidWindowText(PROOF_MAX_WINDOW)} action={<Button asChild variant="outline"><Link href={path}>{m.invalidWindowAction}</Link></Button>} />
      </Page>
    );
  }

  const { report: r, launch } = result;
  const L = r.launchDay;
  const now = c.clock.now();
  const started = (i: number) => L !== null && i <= PROOF_MAX_WINDOW && proofWindows(L, i, now).window.from <= serviceDay(now);
  const startedCount = L === null ? 0 : Array.from({ length: PROOF_MAX_WINDOW }, (_, i) => i + 1).filter(started).length;
  const all: ProofReportResult[] = L !== null && r.baseline && r.window
    ? await Promise.all(Array.from({ length: startedCount }, (_, i) => (i + 1 === result.window ? result : c.proofReportService.getReport(slug, i + 1))))
    : [];

  const day = (d: string) => formatDay(d, locale);
  const noLaunch = r.reasons.includes('no_launch_day');
  const noImport = r.reasons.includes('no_sales_import');
  const facts = { from: r.baseline ? day(r.baseline.period.from) : '', to: r.window ? day(r.window.period.to) : '', minChecks: PROOF_MIN_FOOD_CHECKS, minDays: PROOF_MIN_TRADING_DAYS, dataThrough: r.dataThrough ? day(r.dataThrough) : '' };
  const baselineFacts = { ...facts, from: r.baseline ? day(r.baseline.period.from) : '', to: r.baseline ? day(r.baseline.period.to) : '' };

  const launchCard = (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{m.launchTitle}</CardTitle>
        <CardDescription>{m.launchHelp}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {launch.current && <p className="text-sm">{m.launchSet(day(launch.current.launchDay), t.admin.roles[launch.current.setByRole as keyof typeof t.admin.roles] ?? launch.current.setByRole, launch.changes)}</p>}
        {canManage ? (
          <form action={setProofLaunchDay} className="grid max-w-xl gap-3">
            <Hidden fields={{ slug, back: path, expectedCurrent: launch.current?.id ?? '' }} />
            <label className="grid gap-1 text-sm font-medium">
              {m.launchLabel}
              <Input name="launchDay" type="date" required min="2020-01-01" defaultValue={launch.current?.launchDay ?? ''} className="max-w-48" />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              {m.reasonLabel}
              <Input name="reason" type="text" maxLength={200} required={launch.current !== null} />
              <span className="text-xs font-normal text-muted-foreground">{launch.current ? m.reasonLater : m.reasonFirst}</span>
            </label>
            <div><Button type="submit">{m.save}</Button></div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{m.readOnly}</p>
        )}
        {launch.history.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">{m.historyTitle}</h3>
            <ol className="grid gap-2 text-sm">
              {launch.history.map((h) => (
                <li key={h.id}>
                  {m.historyEntry(h.seq, day(h.launchDay), t.admin.roles[h.setByRole as keyof typeof t.admin.roles] ?? h.setByRole, formatDateTime(h.setAt, locale))}
                  {h.afterWindow1 && <Badge variant="outline" className="ml-2">{m.launchChangedLate}</Badge>}
                  {h.reason && <div className="text-muted-foreground">{m.historyReason(h.reason)}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const explain = (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>{m.howTitle}</CardTitle></CardHeader>
        <CardContent><p className="text-sm">{m.howText({ minChecks: PROOF_MIN_FOOD_CHECKS, minDays: PROOF_MIN_TRADING_DAYS })}</p></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{m.notTitle}</CardTitle></CardHeader>
        <CardContent>
          <ul className="grid list-disc gap-2 pl-4 text-sm">
            {r.caveats.map((k) => <li key={k}>{m.notPoints[k]}</li>)}
          </ul>
        </CardContent>
      </Card>
    </div>
  );

  if (noLaunch || noImport) {
    return (
      <Page>
        <PageHeader title={m.title} description={m.description} />
        <Flash saved={one(sp.saved)} error={one(sp.error)} />
        <Card className="mb-6">
          {noLaunch ? (
            <EmptyState title={m.emptyNoLaunchTitle} description={canManage ? m.emptyNoLaunchText : m.emptyNoLaunchReadOnly} />
          ) : (
            <EmptyState title={m.emptyNoImportTitle} description={m.emptyNoImportText} action={<Button asChild><Link href={`/admin/${slug}/import/sales`}>{m.emptyNoImportAction}</Link></Button>} />
          )}
        </Card>
        {launchCard}
        {explain}
      </Page>
    );
  }

  const w = result.window;
  const prev = w > 1 ? `${path}?window=${w - 1}` : null;
  const next = started(w + 1) ? `${path}?window=${w + 1}` : null;
  const period = r.window ? m.window(w, day(r.window.period.from), day(r.window.period.to)) : '';

  return (
    <Page>
      <PageHeader title={m.title} description={m.description} />
      <Flash saved={one(sp.saved)} error={one(sp.error)} />

      <nav aria-label={m.windowNav} className="mb-4 flex flex-wrap items-center gap-3">
        {prev ? <Button asChild variant="outline" size="sm"><Link href={prev}>← {m.prev}</Link></Button> : <span className="text-sm text-muted-foreground">← {m.prev}</span>}
        <h2 className="font-serif text-xl">{period}</h2>
        {next ? <Button asChild variant="outline" size="sm"><Link href={next}>{m.next} →</Link></Button> : <span className="text-sm text-muted-foreground">{m.next} →</span>}
      </nav>
      <p className="mb-4 text-sm text-muted-foreground">
        {m.dataThrough(r.dataThrough ? day(r.dataThrough) : '', '')}
        {launch.history.some((h) => h.afterWindow1) && <Badge variant="outline" className="ml-2">{m.launchChangedLate}</Badge>}
      </p>
      {r.oldBaseline && <Alert className="mb-4" role="note"><AlertDescription>{m.oldBaseline}</AlertDescription></Alert>}

      <Card className="mb-6">
        <CardHeader><CardTitle>{m.resultTitle}</CardTitle></CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-6 sm:grid-cols-2">
            {r.baseline && <Counter label={`${m.before} (${m.baselineLabel})`} s={r.baseline} m={m} locale={locale} day={day} />}
            {r.window && <Counter label={m.after} s={r.window} m={m} locale={locale} day={day} />}
          </div>
          {r.verdict !== 'insufficient' && r.change ? (
            <div className="grid gap-2" data-verdict={r.verdict}>
              {(() => {
                const ch = changeText(r.change, r.verdict, locale);
                return <p className="text-2xl font-medium tabular-nums">{m.changeLine(ch.delta, ch.low, ch.high)}</p>;
              })()}
              <p>{m.verdict[r.verdict]}</p>
              {r.minimumDetectableChangePp !== null && <p className="text-sm text-muted-foreground">{m.minimumChange(Math.ceil(r.minimumDetectableChangePp))}</p>}
            </div>
          ) : (
            <div className="grid gap-2" data-verdict="insufficient">
              <h3 className="font-medium">{m.notEnoughTitle}</h3>
              <p className="text-sm text-muted-foreground">{m.notEnoughText}</p>
              <ul className="grid gap-2 text-sm">
                {r.reasons.map((reason) => {
                  const text = reason === 'baseline_no_data' ? m.reasons[reason](baselineFacts) : m.reasons[reason](facts);
                  return <li key={reason}><b className="font-medium">{text.what}</b> {text.todo}</li>;
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6 gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle>{m.tableTitle}</CardTitle></CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.colPeriod}</TableHead><TableHead>{m.colChecks}</TableHead><TableHead>{m.colRate}</TableHead><TableHead>{m.colInterval}</TableHead><TableHead>{m.colChange}</TableHead><TableHead>{m.colDays}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.baseline && <WindowRow label={m.baselineLabel} s={r.baseline} change={null} verdict="insufficient" m={m} locale={locale} day={day} />}
            {all.filter((x) => x.window === w || (x.report.window?.foodChecks ?? 0) > 0).map((x) => x.report.window && (
              <WindowRow key={x.window} label={m.windowShort(x.window)} s={x.report.window} change={x.report.change} verdict={x.report.verdict} m={m} locale={locale} day={day} current={x.window === w} />
            ))}
          </TableBody>
        </Table>
      </Card>

      {r.groups && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{m.groupsTitle}</CardTitle>
            <CardDescription>{m.groupsCaveat}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Table>
              <TableHeader>
                <TableRow><TableHead><span className="sr-only">{m.groupsTitle}</span></TableHead><TableHead>{m.colChecks}</TableHead><TableHead>{m.colRate}</TableHead><TableHead>{m.groupRevenue}</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {([['withCode', m.groupWithCode], ['withoutCode', m.groupWithoutCode]] as const).map(([key, label]) => {
                  const g = r.groups![key];
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="whitespace-normal">{m.checksOf(g.foodChecksWithWine, g.foodChecks)}</TableCell>
                      <TableCell>{g.enough && g.attachRate !== null ? percentWhole(g.attachRate, locale) : m.groupNotEnough}</TableCell>
                      <TableCell>{g.enough && g.wineRevenuePerTable !== null ? zl(g.wineRevenuePerTable, locale) : m.groupNotEnough}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">{m.groupNone}</p>
          </CardContent>
        </Card>
      )}

      {r.codes && <CodesCard codes={r.codes} m={m} />}
      {launchCard}
      {explain}
    </Page>
  );
}

type M = Awaited<ReturnType<typeof getI18n>>['t']['admin']['proof'];
type Loc = Awaited<ReturnType<typeof getI18n>>['locale'];

function Counter({ label, s, m, locale, day }: { label: string; s: ProofWindowSummary; m: M; locale: Loc; day: (d: string) => string }) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{day(s.period.from)} – {day(s.period.to)}</div>
      <div className="font-serif text-4xl tabular-nums">{s.attachRate !== null ? percentWhole(s.attachRate, locale) : m.noValue}</div>
      <div className="text-sm">{m.checksOf(s.foodChecksWithWine, s.foodChecks)}</div>
      <div className="text-xs text-muted-foreground">{m.tradingDays(s.tradingDays, s.days)}</div>
      {s.attachRate === null && <div className="text-xs text-muted-foreground">{m.rateHidden(PROOF_MIN_FOOD_CHECKS)}</div>}
    </div>
  );
}

function WindowRow({ label, s, change, verdict, m, locale, day, current = false }: { label: string; s: ProofWindowSummary; change: ProofReport['change']; verdict: ProofReport['verdict']; m: M; locale: Loc; day: (d: string) => string; current?: boolean }) {
  const ch = change ? changeText(change, verdict, locale) : null;
  const running = s.reasons.includes('window_incomplete');
  return (
    <TableRow aria-current={current ? 'true' : undefined} className={current ? 'bg-muted/50' : undefined}>
      <TableCell className="min-w-44 whitespace-normal"><b className="font-medium">{label}</b><div className="text-xs text-muted-foreground">{day(s.period.from)} – {day(s.period.to)}</div></TableCell>
      <TableCell className="whitespace-normal">{s.foodChecksWithWine} / {s.foodChecks}</TableCell>
      <TableCell>{s.attachRate !== null ? percentWhole(s.attachRate, locale) : m.noValue}</TableCell>
      <TableCell>{s.interval ? percentInterval(s.interval.low, s.interval.high, locale) : m.noValue}</TableCell>
      <TableCell className="whitespace-normal">{running ? m.incomplete : ch ? `${ch.delta} (${ch.low} … ${ch.high})` : m.noValue}</TableCell>
      <TableCell>{s.tradingDays} / {s.days}</TableCell>
    </TableRow>
  );
}

function CodesCard({ codes, m }: { codes: NonNullable<ProofReport['codes']>; m: M }) {
  const rows: Array<[string, number]> = [[m.codesIssued, codes.issued], [m.codesConfirmed, codes.staffConfirmed], [m.codesInSales, codes.posMatched], [m.codesOrdered, codes.ordered], [m.codesUnmatched, codes.unmatchedPosCodes]];
  return (
    <Card className="mb-6">
      <CardHeader><CardTitle>{m.codesTitle}</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-5">
          {rows.map(([label, n]) => (
            <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-serif text-2xl tabular-nums">{n}</dd></div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
