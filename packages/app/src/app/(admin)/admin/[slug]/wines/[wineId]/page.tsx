import { STYLE_LABELS } from '@wine-match/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LevelMeter } from '@wine-match/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Page, PageHeader } from '../../../_components/admin-shell';
import { ActiveBadge, RoleBadge, ScoreBadge } from '../../../_components/badges';
import { vintageLabel, zl } from '../../../_components/format';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Wine' };

type Props = { params: Promise<{ slug: string; wineId: string }> };

const SCALES = [
  ['body', 'Body'], ['acidity', 'Acidity'], ['tannin', 'Tannin'], ['sweetness', 'Sweetness'],
  ['fruitiness', 'Fruit'], ['oak', 'Oak'], ['aromatic', 'Aromatics'], ['freshness', 'Freshness']
] as const;

/** A5 — wine details: listing, prices, profile and the dishes it suits best. */
export default async function WinePage({ params }: Props) {
  const { slug, wineId } = await params;
  const d = await (await getRequestScope()).cradle.adminService.wineDetail(slug, wineId);
  if (!d) notFound();
  const { wine: w, bestDishes, approvedFor } = d;
  const p = w.profile;

  return (
    <Page>
      <PageHeader
        back={{ href: `/admin/${slug}/wines`, label: 'Wine list' }}
        title={`${w.producer} ${w.name}`}
        description={`${vintageLabel(w)}, ${w.region}, ${w.country}. ${w.grapes.join(', ')}.`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3"><CardTitle>Listing and prices</CardTitle><ActiveBadge active={w.active} /></div>
            <CardDescription>{w.tastingNote}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Style</dt><dd className="mt-0.5 font-medium">{STYLE_LABELS[p.style]}, {p.alcohol}% abv</dd></div>
              <div><dt className="text-muted-foreground">List no.</dt><dd className="mt-0.5 font-medium tabular-nums">{w.listNumber ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Serving</dt><dd className="mt-0.5 font-medium">{w.glassPrice !== null ? `Glass (${w.glassPour} ml) and bottle` : 'Bottle only'}</dd></div>
              <div><dt className="text-muted-foreground">Glass price</dt><dd className="mt-0.5 font-medium tabular-nums">{w.glassPrice !== null ? zl(w.glassPrice) : '—'}</dd></div>
              <div><dt className="text-muted-foreground">Bottle price</dt><dd className="mt-0.5 font-medium tabular-nums">{zl(w.bottlePrice)} ({w.bottleSize} ml)</dd></div>
              <div><dt className="text-muted-foreground">Character</dt><dd className="mt-0.5 font-medium">{p.adventurous ? 'Adventurous' : 'Classic'}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best dishes for this wine</CardTitle>
            <CardDescription>Engine ranking among the menu, before any sommelier decision.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {bestDishes.map((x) => (
              <div key={x.dish.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/${slug}/menu/${x.dish.id}`} className="font-medium underline-offset-4 hover:underline">{x.dish.name}</Link>
                  <p className="text-xs text-muted-foreground">{x.why}</p>
                </div>
                <ScoreBadge score={x.score} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Wine profile</CardTitle><CardDescription>Scale 0–5.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              {SCALES.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4 text-sm"><dt>{label}</dt><dd><LevelMeter value={p[key]} /></dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approved pairings</CardTitle>
            <CardDescription>Dishes where the sommelier chose this wine.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {approvedFor.length === 0 ? <p className="text-sm text-muted-foreground">No approved pairings yet.</p> : approvedFor.map((x) => (
              <div key={x.dish.id} className="flex items-center justify-between gap-3 text-sm">
                <Link href={`/admin/${slug}/pairings/${x.dish.id}`} className="font-medium underline-offset-4 hover:underline">{x.dish.name}</Link>
                <RoleBadge role={x.role} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
