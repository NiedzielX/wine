import type { Locale, SalesKpis, SalesPeriod } from '@wine-match/core';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorMessage, Input, Label } from '@wine-match/ui';
import type { Dictionary } from '@/i18n/en';
import { formatDay, formatRate, zl } from './format';

/** What the page loaded for the chosen period: the KPIs, or a period the service refused (`invalid_period`). */
export type AttachRateResult = { ok: true; kpis: SalesKpis } | { ok: false };

/**
 * A13 — the Wine Attach Rate of a period (spec 2026-10-15-pos-sales-import-attach-rate, phase 2, US2, AC7, AC8):
 * a GET form with two business days (works without JavaScript), the rate as "40.0%" with "4 of 10 checks with food had
 * wine", and the four money KPIs. No data → `EmptyState`, a refused period → `ErrorMessage`. Presentation only: the
 * numbers come from `SalesKpiService.getSalesKpis`. No explanation of its own: the screen's one "i" explains the rate.
 */
export function SalesAttachRate({ action, period, range, result, locale, t }: {
  /** the page the form sends the period to */
  action: string;
  /** the dates in the form: the period shown, or the one typed when it was refused */
  period: { from: string; to: string };
  range: SalesPeriod | null;
  result: AttachRateResult;
  locale: Locale;
  t: Dictionary;
}) {
  const m = t.admin.import.sales.attach;
  return (
    <Card id="wine-attach-rate" data-wine-attach-rate className="min-w-0 scroll-mt-4">
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>
          {m.description} {range ? m.range(formatDay(range.from, locale), formatDay(range.to, locale)) : m.noRange}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form method="get" action={`${action}#wine-attach-rate`} className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="war-from">{m.from}</Label>
            <Input id="war-from" name="from" type="date" required defaultValue={period.from} className="w-44" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="war-to">{m.to}</Label>
            <Input id="war-to" name="to" type="date" required defaultValue={period.to} className="w-44" />
          </div>
          <Button type="submit" variant="secondary">{m.show}</Button>
        </form>
        <AttachRateBody result={result} locale={locale} t={t} />
      </CardContent>
    </Card>
  );
}

function AttachRateBody({ result, locale, t }: { result: AttachRateResult; locale: Locale; t: Dictionary }) {
  const m = t.admin.import.sales.attach;
  if (!result.ok) return <ErrorMessage compact title={m.invalidTitle} message={m.invalid} />;
  const k = result.kpis;
  if (k.source === null) return <div data-attach-empty><EmptyState title={m.noDataTitle} description={m.noData} /></div>;
  const money = (n: number | null) => (n === null ? <span aria-label={m.noneLabel}>{m.none}</span> : zl(n, locale));
  const kpis = [
    { key: 'per-guest', label: m.perGuest, value: money(k.wineRevenuePerGuest), detail: k.covers === null ? m.noGuests : m.guests(k.covers) },
    { key: 'per-table', label: m.perTable, value: money(k.wineRevenuePerTable), detail: m.tables(k.foodChecks) },
    { key: 'bottle', label: m.averageBottle, value: money(k.averageBottle), detail: null },
    { key: 'glass', label: m.averageGlass, value: money(k.averageGlass), detail: null }
  ];
  return (
    <div className="grid gap-4">
      {k.attachRate === null
        ? <div data-attach-empty><EmptyState title={m.noDataTitle} description={m.noFood(k.checks)} /></div>
        : (
          <div className="min-w-0 rounded-md bg-muted px-4 py-3">
            <div className="text-sm text-muted-foreground">{m.period(formatDay(k.period.from, locale), formatDay(k.period.to, locale))}</div>
            <div className="font-serif text-4xl tabular-nums" data-attach-rate>{formatRate(k.attachRate, locale)}</div>
            <div className="text-sm text-muted-foreground" data-attach-text>{m.rateText(k.foodChecksWithWine, k.foodChecks)}</div>
          </div>
        )}
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:grid-cols-4">
        {kpis.map((x) => (
          <div key={x.key} className="min-w-0" data-sales-kpi={x.key}>
            <dt className="text-sm text-muted-foreground">{x.label}</dt>
            <dd className="font-serif text-2xl tabular-nums">{x.value}</dd>
            {x.detail && <dd className="text-xs text-muted-foreground">{x.detail}</dd>}
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{m.net}</p>
    </div>
  );
}
