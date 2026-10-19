import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ENGINE_FACTS, PAIRING_ROWS_LIMIT, type PairingPerformance, type UsageSummary } from '@wine-match/core';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PanelExplain } from '../../_components/explain';
import { Kpi } from '../../_components/kpi';
import { formatDateTime } from '../../_components/format';
import { settleSection, type SettledSection } from '@/server/analytics-section';
import { getRequestScope } from '@/server/request-scope';
import { dataSource } from '@/server/container';
import { getI18n } from '@/server/i18n';
import { PairingPerformanceSection } from './pairing-performance';
import { UsageKpis } from './usage-kpis';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.dashboard };
}

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * A1 — dashboard: guest usage of the last 28 days (spec 2026-10-15-kpi-dashboard, phase 1), the state of the wine
 * program (catalog KPIs), what needs attention and pairing performance (phase 3). Each analytics section is settled on
 * its own (R9). `?pairs=all` shows every pairing row, any other value the top 10 (Q11).
 */
export default async function DashboardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const showAll = (await searchParams)?.pairs === 'all';
  const { adminService, opportunityService, analyticsService } = (await getRequestScope()).cradle;
  const panelLocale = (await getI18n()).locale;
  const [o, usage, performance] = await Promise.all([
    adminService.overview(slug, panelLocale),
    settleSection(slug, 'usage', analyticsService.usageSummary(slug)),
    settleSection(slug, 'pairings', analyticsService.pairingPerformance(slug, { limit: showAll ? undefined : PAIRING_ROWS_LIMIT, locale: panelLocale }))
  ]);
  if (!o) notFound();
  // the restaurant exists (overview found it), so a summary is null only if it was removed in between: show the section error
  const usageSection: SettledSection<UsageSummary> = usage.ok && usage.value ? { ok: true, value: usage.value } : { ok: false };
  const pairingsSection: SettledSection<PairingPerformance> = performance.ok && performance.value ? { ok: true, value: performance.value } : { ok: false };
  // Q19: one line with the number of S1–S3 opportunities of the whole menu (no queries on guest events), no counter in the sidebar
  const opportunities = (await opportunityService.list(slug, { scope: 'dish' }))?.groups.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const base = `/admin/${slug}`;
  const { dishes, wines, pairings, primaryCoverage, review } = o;
  const { locale, t } = await getI18n();
  const d = t.admin.dashboard;

  return (
    <Page>
      <PageHeader
        title={d.title}
        description={d.description(o.restaurant.name, formatDateTime(o.restaurant.publishedAt, locale))}
        actions={<><Badge variant="outline">{d.dataSource(dataSource())}</Badge><Button asChild variant="outline"><Link href={`/r/${slug}`}>{d.guestView}</Link></Button></>}
      />

      {review.suggestions > 0 && (
        <Alert className="mb-6 border-transparent bg-accent text-accent-foreground">
          <AlertTitle>{d.waitingTitle(review.suggestions)}</AlertTitle>
          <AlertDescription className="text-accent-foreground/80">
            <span>{d.waitingText}</span>
            <Button asChild size="sm" className="mt-2"><Link href={`${base}/review`}>{d.reviewNow}</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      <UsageKpis result={usageSection} slug={slug} locale={locale} />

      <PanelExplain id="dashboard" className="mb-3" summary={t.admin.explain.dashboard.summary} points={t.admin.explain.dashboard.points(ENGINE_FACTS)} />
      <section aria-label={d.program} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi lead label={d.sommelierLed} value={d.sommelierLedValue(primaryCoverage.withPrimary, primaryCoverage.published)} detail={d.sommelierLedDetail} />
        <Kpi label={d.publishedDishes} value={String(dishes.published)} detail={d.publishedDishesDetail(dishes.total, dishes.draft, dishes.hidden)} />
        <Kpi label={d.winesOnList} value={String(wines.active)} detail={d.winesDetail(wines.byGlass, wines.inactive)} />
        <Kpi label={d.approvedPairings} value={String(pairings.approved)} detail={d.approvedDetail(pairings.suggested, pairings.rejected)} />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{d.attention}</CardTitle>
          <CardDescription>{d.attentionText(review.reviewedDishes, review.dishesWithPairings)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {primaryCoverage.without.length === 0 && dishes.draftProfiles === 0 && review.suggestions === 0 && wines.inactive === 0 && o.unpublishedChanges === 0 && opportunities === 0 && dishes.total > 0 && wines.total > 0 ? (
            <p className="text-muted-foreground">{d.upToDate}</p>
          ) : null}
          {dishes.total === 0 && <p><b className="font-medium">{d.menuEmpty}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/import/menu`}>{d.importMenu}</Link></p>}
          {wines.total === 0 && <p><b className="font-medium">{d.winesEmpty}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/import/wines`}>{d.importWines}</Link></p>}
          {o.unpublishedChanges > 0 && (
            <p><b className="font-medium">{d.unpublished(o.unpublishedChanges)}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/publish`}>{d.publish}</Link></p>
          )}
          {primaryCoverage.without.length > 0 && (
            <div>
              <p className="font-medium">{d.noPrimary(primaryCoverage.without.length)}</p>
              <ul className="mt-1.5 grid gap-1">
                {primaryCoverage.without.slice(0, 6).map((d) => (
                  <li key={d.id}><Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/pairings/${d.id}`}>{d.name}</Link></li>
                ))}
                {primaryCoverage.without.length > 6 && <li className="text-muted-foreground">{d.andMore(primaryCoverage.without.length - 6)}</li>}
              </ul>
            </div>
          )}
          {opportunities > 0 && (
            <p><b className="font-medium">{d.opportunities(opportunities)}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/opportunities`}>{d.openOpportunities}</Link></p>
          )}
          {dishes.draftProfiles > 0 && (
            <p><b className="font-medium">{d.draftProfiles(dishes.draftProfiles)}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/menu`}>{d.openMenu}</Link></p>
          )}
          {wines.inactive > 0 && (
            <p><b className="font-medium">{d.hiddenWines(wines.inactive)}</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/wines`}>{d.openWines}</Link></p>
          )}
        </CardContent>
      </Card>

      <PairingPerformanceSection result={pairingsSection} slug={slug} showAll={showAll} locale={locale} />
    </Page>
  );
}
