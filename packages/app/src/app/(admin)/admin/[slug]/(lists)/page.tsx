import { Alert, AlertDescription, AlertTitle, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../_components/admin-shell';
import { formatDateTime } from '../../_components/format';
import { getRequestScope } from '@/server/request-scope';
import { dataSource } from '@/server/container';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dashboard' };

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
  const o = await (await getRequestScope()).cradle.adminService.overview(slug);
  if (!o) notFound();
  const base = `/admin/${slug}`;
  const { dishes, wines, pairings, primaryCoverage, review } = o;

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description={`${o.restaurant.name}. Last published ${formatDateTime(o.restaurant.publishedAt)}.`}
        actions={<><Badge variant="outline">Data source: {dataSource()}</Badge><Button asChild variant="outline"><Link href={`/r/${slug}`}>Guest view</Link></Button></>}
      />

      {review.suggestions > 0 && (
        <Alert className="mb-6 border-transparent bg-accent text-accent-foreground">
          <AlertTitle>{review.suggestions} engine suggestions are waiting for your review</AlertTitle>
          <AlertDescription className="text-accent-foreground/80">
            <span>Guests see a suggestion as “Best match”, never as a sommelier recommendation, until it is approved.</span>
            <Button asChild size="sm" className="mt-2"><Link href={`${base}/review`}>Review now</Link></Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Wine program" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi lead label="Sommelier-led dishes" value={`${primaryCoverage.withPrimary} of ${primaryCoverage.published}`} detail="Published dishes with an approved primary pairing" />
        <Kpi label="Published dishes" value={String(dishes.published)} detail={`${dishes.total} on the menu, ${dishes.draft} draft, ${dishes.hidden} hidden`} />
        <Kpi label="Wines on the list" value={String(wines.active)} detail={`${wines.byGlass} by the glass${wines.inactive ? `, ${wines.inactive} hidden from guests` : ''}`} />
        <Kpi label="Approved pairings" value={String(pairings.approved)} detail={`${pairings.suggested} suggested, ${pairings.rejected} rejected`} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Needs your attention</CardTitle>
            <CardDescription>{review.reviewedDishes} of {review.dishesWithPairings} dishes have at least one approved pairing.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {primaryCoverage.without.length === 0 && dishes.draftProfiles === 0 && review.suggestions === 0 && wines.inactive === 0 && o.unpublishedChanges === 0 && dishes.total > 0 && wines.total > 0 ? (
              <p className="text-muted-foreground">Nothing to review. The program is up to date.</p>
            ) : null}
            {dishes.total === 0 && <p><b className="font-medium">The menu is empty.</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/import/menu`}>Import your menu</Link></p>}
            {wines.total === 0 && <p><b className="font-medium">The wine list is empty.</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/import/wines`}>Import your wine list</Link></p>}
            {o.unpublishedChanges > 0 && (
              <p><b className="font-medium">{o.unpublishedChanges} unpublished {o.unpublishedChanges === 1 ? 'change' : 'changes'}.</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/publish`}>Publish</Link></p>
            )}
            {primaryCoverage.without.length > 0 && (
              <div>
                <p className="font-medium">{primaryCoverage.without.length} dishes have no primary pick</p>
                <ul className="mt-1.5 grid gap-1">
                  {primaryCoverage.without.slice(0, 6).map((d) => (
                    <li key={d.id}><Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/pairings/${d.id}`}>{d.name}</Link></li>
                  ))}
                  {primaryCoverage.without.length > 6 && <li className="text-muted-foreground">and {primaryCoverage.without.length - 6} more</li>}
                </ul>
              </div>
            )}
            {dishes.draftProfiles > 0 && (
              <p><b className="font-medium">{dishes.draftProfiles} taste profiles are still drafts.</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/menu`}>Open the menu</Link></p>
            )}
            {wines.inactive > 0 && (
              <p><b className="font-medium">{wines.inactive} wine is hidden from guests.</b>{' '}<Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`${base}/wines`}>Open the wine list</Link></p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guest activity</CardTitle>
            <CardDescription>Sessions, recommendations shown, wines chosen and wine revenue.</CardDescription>
          </CardHeader>
          <CardContent className="grid justify-items-start gap-3">
            <p className="font-serif text-xl">No guests have used Wine Match yet</p>
            <p className="text-sm text-muted-foreground">Usage and sales figures appear here once guests start using the app. Nothing has been recorded yet.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><Link href={`${base}/qr`}>Get the QR code</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={`/r/${slug}`}>Open the guest app</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
