import { parseDishIds } from '@wine-match/core';
import { MatchGlass } from '@wine-match/ui/brand/match-glass';
import type { Metadata } from 'next';
import { Button, EmptyState, TopBar } from '../../../../_components/guest-ui';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your wine' };

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: SearchParams };

/** G8 — selection confirmation: the screen the guest shows to the waiter. */
export default async function SelectedPage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const { q, prefs, services } = await guestContext(searchParams);
  const tableIds = parseDishIds({ dishes: q.table });
  const dishId = typeof q.dish === 'string' ? q.dish : undefined;
  const data = await services.recommendationService.wineDetails(slug, wineId, dishId);
  if (!data) notFound();
  const { restaurant, wine, dish } = data;
  const back = `/r/${slug}/wine/${wine.id}${hrefWith('', prefs, { dish: dish?.id, table: tableIds.join(',') })}`;

  if (!wine.active) {
    return (
      <>
        <TopBar back={`/r/${slug}/menu`} title={restaurant.name} />
        <main className="flex-1 px-5"><EmptyState title="This wine is no longer available" text="It may have sold out tonight. Please choose another." action={<Button href={`/r/${slug}/menu`} variant="secondary">Back to menu</Button>} /></main>
      </>
    );
  }
  // A glass is only possible for wines that are poured by the glass; anything else is a bottle.
  const serving = q.serving === 'glass' && wine.glassPrice !== null ? 'glass' : 'bottle';
  const price = serving === 'glass' ? wine.glassPrice : wine.bottlePrice;

  return (
    <>
      <TopBar back={back} title={restaurant.name} />
      <main className="flex-1 px-5 pt-6 pb-8">
        <div className="grid justify-items-center gap-3.5 text-center">
          <MatchGlass score={100} colour={wine.colour} size={54} className="text-ink-2" />
          <p className="max-w-[30ch] text-[15.5px] text-ink-2">Show this to your waiter.</p>
          <div className="grid w-full justify-items-center gap-2.5 rounded-[18px] border border-[#d4ccd0] bg-surface px-5 py-6">
            {wine.listNumber !== undefined && <span className="text-sm text-ink-2">List no. {wine.listNumber}</span>}
            <h2 className="font-serif text-[28px] leading-[1.12]">{wine.producer}<br />{wine.name}</h2>
            <span className="text-ink-2">{wine.vintage === 'NV' ? 'Non-vintage' : wine.vintage}</span>
            <span className="font-semibold tabular-nums">{serving === 'glass' ? `1 glass, ${wine.glassPour} ml` : `1 bottle, ${wine.bottleSize} ml`}, {price} zł</span>
            {dish ? <span className="text-ink-3">With the {dish.name.toLowerCase()}</span> : tableIds.length > 0 ? <span className="text-ink-3">For the table</span> : null}
          </div>
          <div className="mt-2 grid w-full gap-2">
            <Button href={`/r/${slug}/menu`} variant="secondary">Pair another dish</Button>
            <Button href={`/r/${slug}`} variant="quiet">Done</Button>
          </div>
        </div>
      </main>
    </>
  );
}
