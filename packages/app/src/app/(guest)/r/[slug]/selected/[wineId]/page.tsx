import { parseDishIds, parsePeople, usageTier, wineUsageScope } from '@wine-match/core';
import type { Metadata } from 'next';
import { Button, EmptyState, Explain, LanguageSwitch, TableQuantityLine, TopBar } from '../../../../_components/guest-ui';
import { CodeForWaiter } from '../../../../_components/recommendation-code';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { issueCodeForPage } from '@/server/recommendation-code';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.selected };
}

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: SearchParams };

/**
 * G8 — selection confirmation: the screen the guest shows to the waiter. No match glass: this screen confirms a choice,
 * it does not rate it (spec 2026-10-16-how-it-works-explanations, Q13). An active wine gets a recommendation code for
 * the waiter (spec 2026-10-16-recommendation-code, phase 1): issued while the page renders, never for an inactive wine
 * or a 404, and the response is not cacheable (`Cache-Control: no-store`, as every dynamic page). One explanation,
 * under the choice and the code: what happens next, plus the sentence about the code only when a code is shown (E07
 * Q15 — the code block has no "i" of its own). An inactive wine has no choice to explain, so no explanation.
 * "For the table" with a chosen number of people (`people`, spec whole-table-waiter-path F4, R16) and a bottle also shows
 * the quantity line (`RecommendationService.tableWineQuantity`, `table.quantity`); without a choice, none (Q4).
 */
export default async function SelectedPage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const { q, prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const tableIds = parseDishIds({ dishes: q.table });
  const dishId = typeof q.dish === 'string' ? q.dish : undefined;
  const people = tableIds.length > 0 ? parsePeople(q) : null;
  const data = await services.recommendationService.wineDetails(slug, wineId, dishId, locale);
  if (!data) notFound();
  const { restaurant, wine, dish } = data;
  const back = href(`/r/${slug}/wine/${wine.id}`, prefs, { dish: dish?.id, table: tableIds.join(','), people: people === null ? undefined : String(people) });
  const menuHref = href(`/r/${slug}/menu`);
  const langSwitch = <LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${slug}/selected/${wine.id}`)} t={t} />;
  const l = t.guest.selected;

  if (!wine.active) {
    return (
      <>
        <TopBar back={menuHref} title={restaurant.name} t={t} langSwitch={langSwitch} />
        <main className="flex-1 px-5 lg:mx-auto lg:w-full lg:max-w-[720px]"><EmptyState title={t.guest.wine.unavailableTitle} text={l.unavailableText} action={<Button href={menuHref} variant="secondary">{l.backToMenu}</Button>} /></main>
      </>
    );
  }
  // A glass is only possible for wines that are poured by the glass; anything else is a bottle.
  const serving = q.serving === 'glass' && wine.glassPrice !== null ? 'glass' : 'bottle';
  const price = formatPrice((serving === 'glass' ? wine.glassPrice : null) ?? wine.bottlePrice, locale);
  // the dish wins over the table on this screen, so no table quantity next to a dish
  const quantity = !dish && serving === 'bottle' && people !== null ? await services.recommendationService.tableWineQuantity(slug, wine.id, tableIds, people) : null;

  // R5: the dish wins over the table, as on this screen; the service keeps published dishes of this restaurant only.
  // G8 is always the guest's choice (Q5); the tier is the wine's place for the dish (Q18).
  const issued = await issueCodeForPage(services, restaurant, {
    session, source: 'guest', wineId: wine.id, serving, dishIds: dish ? [dish.id] : tableIds, tier: data.match ? usageTier(data.match) : null
  });
  const code = issued?.code ?? null;
  const explain = t.guest.explain.selected;

  // the guest shows the wine to the waiter: `wine_selected` with the path and the dish ids of the published menu only
  // (R8). An inactive wine (above) records nothing, not even a new session (R6, Q6).
  const { context, dishId: selectedDish, dishIds } = wineUsageScope(q, { dishes: tableIds.length ? (await services.catalogService.publishedMenu(slug))?.dishes ?? [] : dish ? [dish] : [] });
  await trackUsage(services, restaurant, session, [{
    name: 'wine_selected', wineId: wine.id, ...(selectedDish ? { dishId: selectedDish } : {}),
    props: { serving, context, ...(dishIds ? { dishIds } : {}), ...(dishIds && people !== null ? { people } : {}) }
  }]);
  return (
    <>
      <TopBar back={back} title={restaurant.name} t={t} langSwitch={langSwitch} />
      <main className="flex-1 px-5 pt-6 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <div className="grid justify-items-center gap-3.5 text-center">
          <p className="max-w-[30ch] text-body text-ink-2">{l.showWaiter}</p>
          <div className="grid w-full justify-items-center gap-2.5 rounded-2xl border border-[#d4ccd0] bg-surface px-5 py-6">
            {wine.listNumber !== undefined && <span className="text-small text-ink-2">{l.listNo(wine.listNumber)}</span>}
            <h2 className="font-serif text-h1 leading-[1.12]">{wine.producer}<br />{wine.name}</h2>
            <span className="text-ink-2">{wine.vintage === 'NV' ? t.guest.wine.nonVintage : wine.vintage}</span>
            <span className="font-semibold tabular-nums">{serving === 'glass' ? l.oneGlass(wine.glassPour, price) : l.oneBottle(wine.bottleSize, price)}</span>
            {dish ? <span className="text-ink-3">{l.withDish(dish.name)}</span> : tableIds.length > 0 ? <span className="text-ink-3">{l.forTable}</span> : null}
            {quantity && <TableQuantityLine quantity={quantity} t={t} locale={locale} className="text-body font-semibold tabular-nums" />}
          </div>
          <CodeForWaiter code={code} t={t} />
          <Explain id="selected" className="w-full text-left" summary={explain.summary} points={[...explain.points, ...(code ? [l.code.explain] : [])]} />
          <div className="mt-2 grid w-full gap-2">
            <Button href={href(`/r/${slug}/menu`, prefs)} variant="secondary">{l.pairAnother}</Button>
            <Button href={href(`/r/${slug}`)} variant="quiet">{l.done}</Button>
          </div>
        </div>
      </main>
    </>
  );
}
