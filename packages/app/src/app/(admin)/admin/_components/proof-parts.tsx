import { PROOF_MIN_FOOD_CHECKS, PROOF_MIN_TRADING_DAYS, type ProofReport, type ProofReportResult, type ProofWindowSummary } from '@wine-match/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@wine-match/ui';
import type { getI18n } from '@/server/i18n';
import { zl } from './format';
import { changeText, percentInterval, percentWhole } from './proof-format';

/**
 * The sections the results report shows on the screen A33 and on the printable A34 (spec 2026-11-18-owner-proof-report, R4 to R8,
 * R13): one set of components, so the paper says exactly what the screen says. Server components, no script.
 */
export type ProofM = Awaited<ReturnType<typeof getI18n>>['t']['admin']['proof'];
export type ProofLocale = Awaited<ReturnType<typeof getI18n>>['locale'];

export interface ProofFacts { from: string; to: string; minChecks: number; minDays: number; dataThrough: string }
type Common = { m: ProofM; locale: ProofLocale; day: (d: string) => string };

/** The result card: before and after, the change and the verdict, or "not enough data" with each reason and what to do. */
export function ProofResult({ r, m, locale, day, facts, baselineFacts }: Common & { r: ProofReport; facts: ProofFacts; baselineFacts: ProofFacts }) {
  return (
      <Card className="mb-6 print:shadow-none">
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
  );
}

/** The table of the baseline and the windows with data (and the chosen one). */
export function ProofWindowsTable({ r, all, w, m, locale, day }: Common & { r: ProofReport; all: ProofReportResult[]; w: number }) {
  return (
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
  );
}

/** Checks with and without a code: a correlation with its fixed caveat, never a difference between the groups (R6). */
export function ProofGroups({ r, m, locale }: { r: ProofReport; m: ProofM; locale: ProofLocale }) {
  const groups = r.groups!;
  return (
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
                  const g = groups[key];
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
      
  );
}

/** "How we calculate" and "What this report does not say" (R8): the same text on the screen and on paper. */
export function ProofExplain({ r, m }: { r: ProofReport; m: ProofM }) {
  return (
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
}

function Counter({ label, s, m, locale, day }: { label: string; s: ProofWindowSummary; m: ProofM; locale: ProofLocale; day: (d: string) => string }) {
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

function WindowRow({ label, s, change, verdict, m, locale, day, current = false }: { label: string; s: ProofWindowSummary; change: ProofReport['change']; verdict: ProofReport['verdict']; m: ProofM; locale: ProofLocale; day: (d: string) => string; current?: boolean }) {
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

export function CodesCard({ codes, m }: { codes: NonNullable<ProofReport['codes']>; m: ProofM }) {
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
