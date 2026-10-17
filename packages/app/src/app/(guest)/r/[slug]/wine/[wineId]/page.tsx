import { DEFAULT_RESTAURANT_SETTINGS, parseDishIds, styleLabel } from '@wine-match/core';
import type { Metadata } from 'next';
import { BottomBar, Button, EmptyState, Explain, LanguageSwitch, Score, Seal, TopBar } from '../../../../_components/guest-ui';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.wine };
}

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: SearchParams };

function Dots({ label, value, valueLabel }: { label: string; value: number; valueLabel: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center text-[14.5px]">
      <span>{label}</span>
      <span role="img" aria-label={valueLabel} className="inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={`block size-[9px] rounded-full ${i <= value ? 'bg-wine' : 'bg-line'}`} />)}
      </span>
    </div>
  );
}

/**
 * G7 — wine details. Context: `?dish=<id>` (from a dish) or `?table=<ids>` (from the table result).
 * The match glass appears only with a real score for that dish: never from the table result, without a dish, or for a
 * wine the dish does not suggest (spec 2026-10-16-how-it-works-explanations, Q13). "What does this score mean?" sits
 * under the reason (or under the facts when there is none).
 */
export default async function WinePage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const { q, prefs, services, t, locale, lang, session, href, langHrefs } = await guestContext(searchParams);
  const tableIds = parseDishIds({ dishes: q.table });
  const fromTable = tableIds.length > 0;
  const dishId = typeof q.dish === 'string' ? q.dish : undefined;
  const data = await services.recommendationService.wineDetails(slug, wineId, dishId, locale);
  if (!data) notFound();
  const { restaurant, wine, dish } = data;
  // from the table result the dish score is not the one the guest saw, so no score at all
  const match = fromTable ? null : data.match;
  const backHref = fromTable ? href(`/r/${slug}/table/result`, prefs, { dishes: tableIds.join(',') })
    : dish ? href(`/r/${slug}/dish/${dish.id}/wines`, prefs) : href(`/r/${slug}/menu`);
  const langSwitch = <LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${slug}/wine/${wine.id}`)} t={t} />;
  const w = t.guest.wine;

  if (!wine.active) {
    await trackUsage(services, restaurant, session, []);
    return (
      <>
        <TopBar back={backHref} title={restaurant.name} t={t} langSwitch={langSwitch} />
        <main className="flex-1 px-5 lg:mx-auto lg:w-full lg:max-w-[720px]">
          <EmptyState title={w.unavailableTitle} text={w.unavailableText} action={<Button href={backHref} variant="secondary">{w.seeOther}</Button>} />
        </main>
      </>
    );
  }

  const glassOk = wine.glassPrice !== null;
  const defaultServing = prefs.serving === 'bottle' || !glassOk || fromTable ? 'bottle' : 'glass';
  const p = wine.profile;
  const { showScores } = restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS;
  const explain = (
    <Explain
      id="wine"
      summary={t.guest.explain.wine.summary}
      points={t.guest.explain.wine.points({ score: match?.matchScore ?? null, dish: fromTable ? null : dish?.name ?? null, showScores })}
    />
  );
  const radio = 'grid gap-0.5 rounded-[10px] border border-[#d4ccd0] bg-surface px-3.5 py-3 has-[input:checked]:border-wine has-[input:checked]:ring-1 has-[input:checked]:ring-wine has-[input:disabled]:opacity-45 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-wine cursor-pointer';

  // `wine_viewed` comes with phase 2 of the usage events; here only a new session starts
  await trackUsage(services, restaurant, session, []);
  return (
    <>
      <TopBar back={backHref} title={restaurant.name} t={t} langSwitch={langSwitch} />
      <form action={`/r/${slug}/selected/${wine.id}`} method="get" className="flex flex-1 flex-col">
        {dish && <input type="hidden" name="dish" value={dish.id} />}
        {fromTable && <input type="hidden" name="table" value={tableIds.join(',')} />}
        {lang && <input type="hidden" name="lang" value={lang} />}
        <input type="hidden" name="sid" value={session.id} />
        <main className="flex-1 px-5 pt-5 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
          <div className="grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <h1 className="font-serif text-[32px] leading-[1.08]">{wine.name}</h1>
              <p className="mt-1.5 text-ink-2">{wine.producer}</p>
            </div>
            {match ? <Score score={match.matchScore} colour={wine.colour} showScores={showScores} size={52} t={t} /> : <span />}
          </div>

          {match && dish && (
            <div className={`mt-6 grid gap-1.5 rounded-[10px] p-4 ${match.sommelier ? 'bg-brass-soft' : 'bg-paper'}`}>
              <p className={`flex items-center gap-1.5 text-[13.5px] font-semibold ${match.sommelier ? 'text-brass' : 'text-ink-2'}`}>
                {match.sommelier ? <><Seal className="size-3.5" />{w.director(restaurant.wineDirector)}</> : w.whyWith(dish.name)}
              </p>
              <p className="text-[15.5px]">{match.why}</p>
            </div>
          )}
          {match && dish && <div className="mt-3">{explain}</div>}

          <dl className="my-6 grid grid-cols-2 gap-x-5 gap-y-3.5 border-y border-line py-4">
            <div><dt className="text-[13px] text-ink-3">{w.region}</dt><dd className="mt-0.5 text-[15px]">{wine.region}, {wine.country}</dd></div>
            <div><dt className="text-[13px] text-ink-3">{w.vintage}</dt><dd className="mt-0.5 text-[15px]">{wine.vintage === 'NV' ? w.nonVintage : wine.vintage}</dd></div>
            <div><dt className="text-[13px] text-ink-3">{w.grapes}</dt><dd className="mt-0.5 text-[15px]">{wine.grapes.join(', ')}</dd></div>
            <div><dt className="text-[13px] text-ink-3">{w.style}</dt><dd className="mt-0.5 text-[15px]">{w.abv(styleLabel(p.style, locale), p.alcohol)}</dd></div>
          </dl>
          {!(match && dish) && <div className="-mt-3 mb-5">{explain}</div>}

          <p className="font-serif text-xl leading-[1.45] italic">{wine.tastingNote}</p>
          <div className="mt-5 grid gap-2.5">
            <Dots label={w.body} value={p.body} valueLabel={w.dots(p.body)} />
            <Dots label={w.acidity} value={p.acidity} valueLabel={w.dots(p.acidity)} />
            <Dots label={w.tannin} value={p.tannin} valueLabel={w.dots(p.tannin)} />
            <Dots label={w.sweetness} value={p.sweetness} valueLabel={w.dots(p.sweetness)} />
          </div>

          <fieldset className="mt-6 grid grid-cols-2 gap-2.5 border-0 p-0">
            <legend className="sr-only">{w.howServed}</legend>
            <label className={radio}>
              <input type="radio" name="serving" value="glass" className="sr-only" defaultChecked={defaultServing === 'glass'} disabled={!glassOk} />
              <span>{w.glass(wine.glassPour)}</span>
              <b className="tabular-nums">{wine.glassPrice !== null ? formatPrice(wine.glassPrice, locale) : w.bottleOnly}</b>
              {!glassOk && <small className="text-[13px] text-ink-3">{w.notByGlass}</small>}
            </label>
            <label className={radio}>
              <input type="radio" name="serving" value="bottle" className="sr-only" defaultChecked={defaultServing === 'bottle'} />
              <span>{w.bottle(wine.bottleSize)}</span>
              <b className="tabular-nums">{formatPrice(wine.bottlePrice, locale)}</b>
            </label>
          </fieldset>
        </main>
        <BottomBar>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full border border-wine bg-wine px-5 text-[15px] font-semibold text-on-wine hover:bg-wine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">{w.choose}</button>
        </BottomBar>
      </form>
    </>
  );
}
