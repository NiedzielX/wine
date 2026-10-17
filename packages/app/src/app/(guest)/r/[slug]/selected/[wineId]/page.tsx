import { parseDishIds } from '@wine-match/core';
import type { Metadata } from 'next';
import { Button, EmptyState, LanguageSwitch, TopBar } from '../../../../_components/guest-ui';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.selected };
}

type Props = { params: Promise<{ slug: string; wineId: string }>; searchParams: SearchParams };

/**
 * G8 — selection confirmation: the screen the guest shows to the waiter. No match glass: this screen confirms a choice,
 * it does not rate it (spec 2026-10-16-how-it-works-explanations, Q13).
 */
export default async function SelectedPage({ params, searchParams }: Props) {
  const { slug, wineId } = await params;
  const { q, prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const tableIds = parseDishIds({ dishes: q.table });
  const dishId = typeof q.dish === 'string' ? q.dish : undefined;
  const data = await services.recommendationService.wineDetails(slug, wineId, dishId, locale);
  if (!data) notFound();
  const { restaurant, wine, dish } = data;
  const back = href(`/r/${slug}/wine/${wine.id}`, prefs, { dish: dish?.id, table: tableIds.join(',') });
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

  // `wine_selected` comes with phase 2 of the usage events; here only a new session (never for an inactive wine, R6)
  await trackUsage(services, restaurant, session, []);
  return (
    <>
      <TopBar back={back} title={restaurant.name} t={t} langSwitch={langSwitch} />
      <main className="flex-1 px-5 pt-6 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
        <div className="grid justify-items-center gap-3.5 text-center">
          <p className="max-w-[30ch] text-[15.5px] text-ink-2">{l.showWaiter}</p>
          <div className="grid w-full justify-items-center gap-2.5 rounded-[18px] border border-[#d4ccd0] bg-surface px-5 py-6">
            {wine.listNumber !== undefined && <span className="text-sm text-ink-2">{l.listNo(wine.listNumber)}</span>}
            <h2 className="font-serif text-[28px] leading-[1.12]">{wine.producer}<br />{wine.name}</h2>
            <span className="text-ink-2">{wine.vintage === 'NV' ? t.guest.wine.nonVintage : wine.vintage}</span>
            <span className="font-semibold tabular-nums">{serving === 'glass' ? l.oneGlass(wine.glassPour, price) : l.oneBottle(wine.bottleSize, price)}</span>
            {dish ? <span className="text-ink-3">{l.withDish(dish.name)}</span> : tableIds.length > 0 ? <span className="text-ink-3">{l.forTable}</span> : null}
          </div>
          <div className="mt-2 grid w-full gap-2">
            <Button href={href(`/r/${slug}/menu`, prefs)} variant="secondary">{l.pairAnother}</Button>
            <Button href={href(`/r/${slug}`)} variant="quiet">{l.done}</Button>
          </div>
        </div>
      </main>
    </>
  );
}
