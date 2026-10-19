import { KPI_DAYS, MIN_RATE_SAMPLE, type Locale, type UsageSummary } from '@wine-match/core';
import { Button, Card, EmptyState, ErrorMessage } from '@wine-match/ui';
import Link from 'next/link';
import type { SettledSection } from '@/server/analytics-section';
import { getDictionary } from '@/server/i18n';
import { PanelExplain } from '../../_components/explain';
import { Kpi } from '../../_components/kpi';
import { formatCount, formatDelta, formatPeriod, formatRate } from '../../_components/kpi-format';

/**
 * A1 "Guest usage" (spec 2026-10-15-kpi-dashboard, phase 1, #20): guest sessions, dish recommendations viewed and the
 * recommendation → selection rate of the last 28 days with the change against the 28 before, plus the waiter's
 * lookups apart. Loaded and failing on its own (R9). Props only, so the states are testable without a server.
 */
export function UsageKpis({ result, slug, locale }: { result: SettledSection<UsageSummary>; slug: string; locale: Locale }) {
  const t = getDictionary(locale);
  const u = t.admin.dashboard.usage;
  const summary = result.ok ? result.value : null;
  return (
    <section aria-labelledby="usage-title" className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="usage-title" className="font-serif text-2xl">{u.title}</h2>
        {summary && <span className="text-sm text-muted-foreground">{formatPeriod(summary.period.current, locale)}</span>}
      </div>
      {!result.ok ? (
        <Card><ErrorMessage compact title={t.admin.dashboard.analyticsUnavailable} message={t.admin.dashboard.analyticsUnavailableText} /></Card>
      ) : !summary!.hasData ? (
        <Card>
          <EmptyState
            title={u.emptyTitle}
            description={u.emptyText}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm"><Link href={`/admin/${slug}/qr`}>{u.getQr}</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href={`/r/${slug}`}>{u.openGuestApp}</Link></Button>
              </div>
            }
          />
        </Card>
      ) : (
        <UsageTiles summary={summary!} locale={locale} />
      )}
    </section>
  );
}

function UsageTiles({ summary: s, locale }: { summary: UsageSummary; locale: Locale }) {
  const t = getDictionary(locale);
  const u = t.admin.dashboard.usage;
  const conversion = s.recommendationToSelection;
  const sample = conversion.sample!;
  return (
    <>
      <PanelExplain id="usage" className="mb-3" summary={t.admin.explain.usage.summary} points={t.admin.explain.usage.points({ days: KPI_DAYS, minSample: MIN_RATE_SAMPLE })} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={u.sessions} value={formatCount(s.sessions.value ?? 0, locale)} detail={u.sessionsDetail} delta={formatDelta(s.sessions, locale)} />
        <Kpi label={u.views} value={formatCount(s.recommendationViews.value ?? 0, locale)} detail={u.viewsDetail} delta={formatDelta(s.recommendationViews, locale)} />
        <Kpi
          label={u.conversion}
          value={formatRate(conversion.value, locale) ?? u.noData}
          detail={u.conversionDetail(formatCount(sample.numerator, locale), formatCount(sample.denominator, locale))}
          delta={formatDelta(conversion, locale)}
        />
        <Kpi label={u.staffLookups} value={formatCount(s.staffLookups.value ?? 0, locale)} detail={u.staffLookupsDetail} delta={formatDelta(s.staffLookups, locale)} />
      </div>
    </>
  );
}
