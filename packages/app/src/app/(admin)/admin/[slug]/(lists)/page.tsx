import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ENGINE_FACTS } from '@wine-match/core';
import { Page, PageHeader } from '../../_components/admin-shell';
import { PanelExplain } from '../../_components/explain';
import { formatDateTime } from '../../_components/format';
import { getRequestScope } from '@/server/request-scope';
import { dataSource } from '@/server/container';
import { getI18n } from '@/server/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.dashboard };
}

type Props = { params: Promise<{ slug: string }> };

function Kpi({ label, value, detail, lead = false }: { label: string; value: string; detail: string; lead?: boolean }) {
  return (
    <Card className={lead ? 'border-transparent bg-primary text-primary-foreground' : undefined}>
      <CardHeader>
        <CardDescription className={lead ? 'text-primary-foreground/80' : undefined}>{label}</CardDescription>
        <CardTitle className="font-serif text-4xl font-normal tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className={`text-sm ${lead ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{detail}</CardContent>
    </Card>
  );
}

/** A1 — dashboard: the state of the wine program (catalog KPIs) and what needs attention. */
export default async function DashboardPage({ params }: Props) {
  const { slug } = await params;
  const { adminService, opportunityService } = (await getRequestScope()).cradle;
  const o = await adminService.overview(slug, (await getI18n()).locale);
  if (!o) notFound();
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

      <PanelExplain id="dashboard" className="mb-3" summary={t.admin.explain.dashboard.summary} points={t.admin.explain.dashboard.points(ENGINE_FACTS)} />
      <section aria-label={d.program} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi lead label={d.sommelierLed} value={d.sommelierLedValue(primaryCoverage.withPrimary, primaryCoverage.published)} detail={d.sommelierLedDetail} />
        <Kpi label={d.publishedDishes} value={String(dishes.published)} detail={d.publishedDishesDetail(dishes.total, dishes.draft, dishes.hidden)} />
        <Kpi label={d.winesOnList} value={String(wines.active)} detail={d.winesDetail(wines.byGlass, wines.inactive)} />
        <Kpi label={d.approvedPairings} value={String(pairings.approved)} detail={d.approvedDetail(pairings.suggested, pairings.rejected)} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle>{d.activity}</CardTitle>
            <CardDescription>{d.activityText}</CardDescription>
          </CardHeader>
          <CardContent className="grid justify-items-start gap-3">
            <p className="font-serif text-xl">{d.noGuests}</p>
            <p className="text-sm text-muted-foreground">{d.noGuestsText}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><Link href={`${base}/qr`}>{d.getQr}</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={`/r/${slug}`}>{d.openGuestApp}</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
