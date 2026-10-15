import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, LevelMeter } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { DishStatusBadge, ProfileBadge, ScoreBadge } from '../../../_components/badges';
import { zl } from '../../../_components/format';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.admin.meta.dish };
}

type Props = { params: Promise<{ slug: string; dishId: string }> };

const SCALES = ['intensity', 'fat', 'salt', 'sweetness', 'acidity', 'spice', 'umami', 'smoke', 'creaminess'] as const;

/** A3 — dish details: data, taste profile and the wines the engine ranks first for it. */
export default async function DishPage({ params }: Props) {
  const { slug, dishId } = await params;
  const { locale, t } = await getI18n();
  const m = t.admin.dish;
  const d = await (await getRequestScope()).cradle.adminService.dishDetail(slug, dishId, locale);
  if (!d) notFound();
  const { dish, topMatches, pairings } = d;
  const p = dish.profile;

  return (
    <Page>
      <PageHeader
        back={{ href: `/admin/${slug}/menu`, label: m.back }}
        title={dish.name}
        description={dish.description}
        actions={<>
          <Button asChild variant="outline"><Link href={`/admin/${slug}/pairings/${dish.id}`}>{m.managePairings}</Link></Button>
          {dish.status === 'published' && <Button asChild variant="outline"><Link href={`/r/${slug}/dish/${dish.id}`}>{t.admin.common.viewAsGuest}</Link></Button>}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader><CardTitle>{m.details}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">{m.category}</dt><dd className="mt-0.5 font-medium">{t.admin.categories[dish.category] ?? dish.category}</dd></div>
              <div><dt className="text-muted-foreground">{m.price}</dt><dd className="mt-0.5 font-medium tabular-nums">{zl(dish.price, locale)}</dd></div>
              <div><dt className="text-muted-foreground">{m.status}</dt><dd className="mt-0.5"><DishStatusBadge status={dish.status} t={t} /></dd></div>
              <div><dt className="text-muted-foreground">{m.protein}</dt><dd className="mt-0.5 font-medium first-letter:uppercase">{t.admin.proteins[p.protein] ?? p.protein}</dd></div>
              <div><dt className="text-muted-foreground">{m.cooking}</dt><dd className="mt-0.5 font-medium first-letter:uppercase">{t.admin.cooking[p.cooking] ?? p.cooking}</dd></div>
              <div>
                <dt className="text-muted-foreground">{m.pairings}</dt>
                <dd className="mt-0.5 font-medium">{m.pairingsSummary(pairings.approved, pairings.hasPrimary)}<span className="block text-xs font-normal text-muted-foreground">{m.pairingsDetail(pairings.suggested, pairings.rejected)}</span></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{m.topMatches}</CardTitle>
            <CardDescription>{m.topMatchesText}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topMatches.map((x) => (
              <div key={x.wine.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/${slug}/wines/${x.wine.id}`} className="font-medium underline-offset-4 hover:underline">{x.wine.producer} {x.wine.name}</Link>
                  <p className="text-xs text-muted-foreground">{x.why}</p>
                </div>
                <ScoreBadge score={x.score} t={t} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{m.profile}</CardTitle>
              <ProfileBadge source={p.source} t={t} />
            </div>
            <CardDescription>{p.source === 'draft' ? m.profileDraft : m.profileConfirmed}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {SCALES.map((key) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm">
                  <dt>{m.scales[key]}</dt>
                  <dd><LevelMeter value={p[key]} label={t.admin.common.levelOf} /></dd>
                </div>
              ))}
            </dl>
            <Badge variant="outline" className="mt-5">{t.admin.common.scale}</Badge>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
