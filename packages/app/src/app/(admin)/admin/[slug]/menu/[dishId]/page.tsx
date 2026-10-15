import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, LevelMeter } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { DishStatusBadge, ProfileBadge, ScoreBadge } from '../../../_components/badges';
import { zl } from '../../../_components/format';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Dish' };

type Props = { params: Promise<{ slug: string; dishId: string }> };

const SCALES = [
  ['intensity', 'Intensity'], ['fat', 'Fat'], ['salt', 'Salt'], ['sweetness', 'Sweetness'], ['acidity', 'Acidity'],
  ['spice', 'Spice'], ['umami', 'Umami'], ['smoke', 'Smoke, char'], ['creaminess', 'Creaminess']
] as const;

/** A3 — dish details: data, taste profile and the wines the engine ranks first for it. */
export default async function DishPage({ params }: Props) {
  const { slug, dishId } = await params;
  const d = await (await getRequestScope()).cradle.adminService.dishDetail(slug, dishId);
  if (!d) notFound();
  const { dish, topMatches, pairings } = d;
  const p = dish.profile;

  return (
    <Page>
      <PageHeader
        back={{ href: `/admin/${slug}/menu`, label: 'Menu' }}
        title={dish.name}
        description={dish.description}
        actions={<>
          <Button asChild variant="outline"><Link href={`/admin/${slug}/pairings/${dish.id}`}>Manage pairings</Link></Button>
          {dish.status === 'published' && <Button asChild variant="outline"><Link href={`/r/${slug}/dish/${dish.id}`}>View as guest</Link></Button>}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Category</dt><dd className="mt-0.5 font-medium">{dish.category}</dd></div>
              <div><dt className="text-muted-foreground">Price</dt><dd className="mt-0.5 font-medium tabular-nums">{zl(dish.price)}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="mt-0.5"><DishStatusBadge status={dish.status} /></dd></div>
              <div><dt className="text-muted-foreground">Main ingredient</dt><dd className="mt-0.5 font-medium capitalize">{p.protein}</dd></div>
              <div><dt className="text-muted-foreground">Cooking method</dt><dd className="mt-0.5 font-medium capitalize">{p.cooking}</dd></div>
              <div>
                <dt className="text-muted-foreground">Pairings</dt>
                <dd className="mt-0.5 font-medium">{pairings.approved} approved{pairings.hasPrimary ? ', with a primary' : ', no primary yet'}<span className="block text-xs font-normal text-muted-foreground">{pairings.suggested} to review, {pairings.rejected} rejected</span></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top matches with this profile</CardTitle>
            <CardDescription>Engine ranking among active wines, before any sommelier decision.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {topMatches.map((m) => (
              <div key={m.wine.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/${slug}/wines/${m.wine.id}`} className="font-medium underline-offset-4 hover:underline">{m.wine.producer} {m.wine.name}</Link>
                  <p className="text-xs text-muted-foreground">{m.why}</p>
                </div>
                <ScoreBadge score={m.score} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Taste profile</CardTitle>
              <ProfileBadge source={p.source} />
            </div>
            <CardDescription>{p.source === 'draft' ? 'Drafted from the imported description. Check it before relying on the scores.' : 'Confirmed by the restaurant team.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-10 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {SCALES.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm">
                  <dt>{label}</dt>
                  <dd><LevelMeter value={p[key]} /></dd>
                </div>
              ))}
            </dl>
            <Badge variant="outline" className="mt-5">Scale 0–5</Badge>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
