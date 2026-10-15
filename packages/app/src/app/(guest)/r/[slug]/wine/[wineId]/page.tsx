import { STYLE_LABELS, parseDishIds } from '@wine-match/core';
import { MatchGlass } from '@wine-match/ui/brand/match-glass';
import type { Metadata } from 'next';
import { BottomBar, Button, EmptyState, Score, Seal, TopBar } from '../../../../_components/guest-ui';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Wine' };

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: SearchParams };

function Dots({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center text-[14.5px]">
      <span>{label}</span>
      <span role="img" aria-label={`${value} of 5`} className="inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={`block size-[9px] rounded-full ${i <= value ? 'bg-wine' : 'bg-line'}`} />)}
      </span>
    </div>
  );
}

/** G7 — wine details. Context: `?dish=<id>` (from a dish) or `?table=<ids>` (from the table result). */
export default async function WinePage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const { q, prefs, services } = await guestContext(searchParams);
  const tableIds = parseDishIds({ dishes: q.table });
  const fromTable = tableIds.length > 0;
  const dishId = typeof q.dish === 'string' ? q.dish : undefined;
  const data = await services.recommendationService.wineDetails(slug, wineId, dishId);
  if (!data) notFound();
  const { restaurant, wine, dish, match } = data;
  const backHref = fromTable ? `/r/${slug}/table/result${hrefWith('', prefs, { dishes: tableIds.join(',') })}`
    : dish ? `/r/${slug}/dish/${dish.id}/wines${hrefWith('', prefs)}` : `/r/${slug}/menu`;

  if (!wine.active) {
    return (
      <>
        <TopBar back={backHref} title={restaurant.name} />
        <main className="flex-1 px-5 lg:mx-auto lg:w-full lg:max-w-[720px]">
          <EmptyState title="This wine is no longer available" text="It may have sold out tonight. Your other matches are still waiting." action={<Button href={backHref} variant="secondary">See other wines</Button>} />
        </main>
      </>
    );
  }

  const glassOk = wine.glassPrice !== null;
  const defaultServing = prefs.serving === 'bottle' || !glassOk || fromTable ? 'bottle' : 'glass';
  const p = wine.profile;
  const showScores = restaurant.settings?.showScores ?? true;
  const radio = 'grid gap-0.5 rounded-[10px] border border-[#d4ccd0] bg-surface px-3.5 py-3 has-[input:checked]:border-wine has-[input:checked]:ring-1 has-[input:checked]:ring-wine has-[input:disabled]:opacity-45 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-wine cursor-pointer';

  return (
    <>
      <TopBar back={backHref} title={restaurant.name} />
      <form action={`/r/${slug}/selected/${wine.id}`} method="get" className="flex flex-1 flex-col">
        {dish && <input type="hidden" name="dish" value={dish.id} />}
        {fromTable && <input type="hidden" name="table" value={tableIds.join(',')} />}
        <main className="flex-1 px-5 pt-5 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
          <div className="grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <h1 className="font-serif text-[32px] leading-[1.08]">{wine.name}</h1>
              <p className="mt-1.5 text-ink-2">{wine.producer}</p>
            </div>
            {match ? <Score score={match.matchScore} colour={wine.colour} showScores={showScores} size={52} /> : <MatchGlass score={70} colour={wine.colour} size={52} className="text-ink-2" />}
          </div>

          {match && dish && (
            <div className={`mt-6 grid gap-1.5 rounded-[10px] p-4 ${match.sommelier ? 'bg-brass-soft' : 'bg-paper'}`}>
              <p className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${match.sommelier ? 'text-brass' : 'text-ink-2'}`}>
                {match.sommelier ? <><Seal className="size-3.5" />{restaurant.wineDirector}, Wine Director</> : `Why it works with the ${dish.name.toLowerCase()}`}
              </p>
              <p className="text-[15.5px]">{match.why}</p>
            </div>
          )}

          <dl className="my-6 grid grid-cols-2 gap-x-5 gap-y-3.5 border-y border-line py-4">
            <div><dt className="text-[13px] text-ink-3">Region</dt><dd className="mt-0.5 text-[15px]">{wine.region}, {wine.country}</dd></div>
            <div><dt className="text-[13px] text-ink-3">Vintage</dt><dd className="mt-0.5 text-[15px]">{wine.vintage === 'NV' ? 'Non-vintage' : wine.vintage}</dd></div>
            <div><dt className="text-[13px] text-ink-3">Grapes</dt><dd className="mt-0.5 text-[15px]">{wine.grapes.join(', ')}</dd></div>
            <div><dt className="text-[13px] text-ink-3">Style</dt><dd className="mt-0.5 text-[15px]">{STYLE_LABELS[p.style]}, {p.alcohol}% abv</dd></div>
          </dl>

          <p className="font-serif text-xl leading-[1.45] italic">{wine.tastingNote}</p>
          <div className="mt-5 grid gap-2.5">
            <Dots label="Body" value={p.body} />
            <Dots label="Acidity" value={p.acidity} />
            <Dots label="Tannin" value={p.tannin} />
            <Dots label="Sweetness" value={p.sweetness} />
          </div>

          <fieldset className="mt-6 grid grid-cols-2 gap-2.5 border-0 p-0">
            <legend className="sr-only">How would you like it?</legend>
            <label className={radio}>
              <input type="radio" name="serving" value="glass" className="sr-only" defaultChecked={defaultServing === 'glass'} disabled={!glassOk} />
              <span>Glass, {wine.glassPour} ml</span>
              <b className="tabular-nums">{glassOk ? `${wine.glassPrice} zł` : 'Bottle only'}</b>
              {!glassOk && <small className="text-[13px] text-ink-3">Not poured by the glass</small>}
            </label>
            <label className={radio}>
              <input type="radio" name="serving" value="bottle" className="sr-only" defaultChecked={defaultServing === 'bottle'} />
              <span>Bottle, {wine.bottleSize} ml</span>
              <b className="tabular-nums">{wine.bottlePrice} zł</b>
            </label>
          </fieldset>
        </main>
        <BottomBar>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-wine bg-wine px-5 text-[15px] font-semibold text-on-wine hover:bg-wine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">Choose this wine</button>
        </BottomBar>
      </form>
    </>
  );
}
