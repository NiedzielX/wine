import { KPI_DAYS, MIN_RATE_SAMPLE, type Locale, type Metric, type SalesSummary } from '@wine-match/core';
import { Button, Card, EmptyState, ErrorMessage } from '@wine-match/ui';
import Link from 'next/link';
import type { SettledSection } from '@/server/analytics-section';
import { getDictionary } from '@/server/i18n';
import { PanelExplain } from '../../_components/explain';
import { formatDay, zl } from '../../_components/format';
import { Kpi } from '../../_components/kpi';
import { formatCount, formatDelta, formatPeriod, formatRate } from '../../_components/kpi-format';

/**
 * A1 "Sales" (spec 2026-10-15-kpi-dashboard, phase 2, #21): the highlighted Wine attach rate with "N of M checks with
 * food" and its change in pp, and four amounts with their change in % — POS sales of the last 28 days against the 28
 * before (E03), never divided by guest sessions (R4). No sales in the window → the empty state with "Import sales"
 * for `import.manage` (`canImport`). Loaded and failing on its own (R9). Props only, so the states are testable
 * without a server.
 */
export function SalesKpis({ result, slug, canImport, locale }: { result: SettledSection<SalesSummary>; slug: string; canImport: boolean; locale: Locale }) {
  const t = getDictionary(locale);
  const m = t.admin.dashboard.sales;
  const summary = result.ok ? result.value : null;
  return (
    <section aria-labelledby="sales-title" className="mb-6 min-w-0" data-sales-kpis>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="sales-title" className="font-serif text-2xl">{m.title}</h2>
        {summary && <span className="text-sm text-muted-foreground">{formatPeriod(summary.period.current, locale)}</span>}
      </div>
      {!summary ? (
        <Card><ErrorMessage compact title={t.admin.dashboard.analyticsUnavailable} message={t.admin.dashboard.analyticsUnavailableText} /></Card>
      ) : summary.source === null ? (
        <Card data-sales-empty>
          <EmptyState
            title={m.emptyTitle}
            description={m.emptyText(KPI_DAYS)}
            action={
              <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
                {canImport
                  ? <Button asChild size="sm"><Link href={`/admin/${slug}/import/sales`}>{m.importSales}</Link></Button>
                  : <span>{m.noImportAccess}</span>}
                {summary.latestDataDay && <span data-sales-latest>{m.latest(formatDay(summary.latestDataDay, locale))}</span>}
              </div>
            }
          />
        </Card>
      ) : (
        <SalesTiles summary={summary} locale={locale} />
      )}
    </section>
  );
}

function SalesTiles({ summary: s, locale }: { summary: SalesSummary; locale: Locale }) {
  const t = getDictionary(locale);
  const m = t.admin.dashboard.sales;
  const sample = s.attachRate.sample!;
  const amount = (x: Metric) => (x.value === null ? m.noData : zl(x.value, locale));
  // Q3: a window imported only in part renders, and says up to which day the data goes
  const partial = s.latestDataDay !== null && s.latestDataDay < s.period.current.to;
  return (
    <>
      <PanelExplain id="sales-kpis" className="mb-3" summary={t.admin.explain.salesKpis.summary} points={t.admin.explain.salesKpis.points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE })} />
      {partial && <p className="mb-3 text-sm text-muted-foreground" data-sales-through>{m.through(formatDay(s.latestDataDay!, locale))}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          lead
          className="sm:col-span-2 xl:col-span-1 xl:row-span-2"
          data-sales-kpi="attach-rate"
          label={m.attachRate}
          value={formatRate(s.attachRate.value, locale) ?? m.noData}
          detail={m.attachDetail(formatCount(sample.numerator, locale), formatCount(sample.denominator, locale))}
          delta={formatDelta(s.attachRate, locale)}
        />
        <Kpi data-sales-kpi="per-guest" label={m.perGuest} value={amount(s.wineRevenuePerGuest)} detail={m.perGuestDetail} delta={formatDelta(s.wineRevenuePerGuest, locale)} />
        <Kpi data-sales-kpi="per-table" label={m.perTable} value={amount(s.wineRevenuePerTable)} detail={m.perTableDetail} delta={formatDelta(s.wineRevenuePerTable, locale)} />
        <Kpi data-sales-kpi="bottle" label={m.averageBottle} value={amount(s.averageBottle)} detail={m.averageBottleDetail} delta={formatDelta(s.averageBottle, locale)} />
        <Kpi data-sales-kpi="glass" label={m.averageGlass} value={amount(s.averageGlass)} detail={m.averageGlassDetail} delta={formatDelta(s.averageGlass, locale)} />
      </div>
    </>
  );
}
