import { DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS, ENGINE_FACTS, prefsSummary, prefsToQuery, tasteWords, usageTier } from '@wine-match/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BestCard, Button, DishList, EmptyState, Explain, GuestColumns, LanguageSwitch, Notice, QuickPrefs, RecoFooter, TopBar, WineRow } from '../../../../../_components/guest-ui';
import { PrefChips } from '../../../../../_components/pref-chips';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { formatPrice, getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.wines };
}

type Props = { params: Promise<{ slug: string; dishId: string }>; searchParams: SearchParams };

/**
 * G3 + G4 — the dish and its wines, one tap from the menu. Quick preferences sit above the list;
 * `?sheet=filters` opens the full filters (a bottom sheet on phones, a side panel on desktop).
 * On desktop the menu stays in the left column so the guest can switch dishes in one click.
 * "Why these wines?" sits between the preferences and the first wine, also over an empty list; the filters sheet has
 * its own "How do the filters work?" (spec 2026-10-16-how-it-works-explanations). Settings are live, not published.
 */
export default async function WinesPage({ params, searchParams }: Props) {
  const { slug, dishId } = await params;
  const { q, prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const data = await services.recommendationService.forDish(slug, dishId, prefs, undefined, locale);
  if (!data) notFound();
  const { restaurant, dish, result } = data;
  const menu = await services.catalogService.publishedMenu(slug, locale);
  const coverage = await services.catalogService.pairingCoverage(restaurant.id);
  const { showScores, showUnreviewed } = restaurant.settings ?? DEFAULT_RESTAURANT_SETTINGS;
  const ex = t.guest.explain;
  const path = `/r/${slug}/dish/${dish.id}/wines`;
  const active = prefsSummary(prefs, locale);
  const [best, ...rest] = result.items;
  const wineHref = (id: string) => href(`/r/${slug}/wine/${id}`, prefs, { dish: dish.id });
  const sheetOpen = q.sheet === 'filters';
  const filtersHref = href(path, prefs, { sheet: 'filters' });

  const main = (
    <main className="flex-1 px-5 pt-5 pb-10 lg:px-8">
      <header>
        <h1 className="font-serif text-[30px] leading-[1.08] tracking-tight lg:text-4xl">{dish.name}</h1>
        <p className="mt-1.5 line-clamp-2 max-w-[48ch] text-[15px] text-ink-2">{dish.description}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[15px] tabular-nums">{formatPrice(dish.price, locale)}</span>
          {tasteWords(dish, locale).map((w) => <span key={w} className="rounded-full bg-[#ebe7e9] px-2.5 py-0.5 text-[13px] text-ink-2">{w}</span>)}
        </div>
      </header>

      <div className="mt-4"><QuickPrefs prefs={prefs} hrefFor={(p) => href(path, p)} moreHref={filtersHref} t={t} locale={locale} /></div>

      {result.notice && <Notice>{result.notice}</Notice>}

      <Explain id="wines" className="mt-2" summary={ex.wines.summary} points={ex.wines.points(ENGINE_FACTS, { showScores, showUnreviewed, director: restaurant.wineDirector })} />

      {!best ? (
        <EmptyState
          title={t.guest.wines.noneTitle}
          text={active.length ? t.guest.wines.noneFiltered : t.guest.wines.noneYet}
          action={active.length ? <Button href={href(path)} variant="secondary">{t.guest.wines.clearFilters}</Button> : undefined}
        />
      ) : (
        <>
          <BestCard item={best} href={wineHref(best.wine.id)} serving={prefs.serving} showScores={showScores} t={t} locale={locale} />
          {rest.length > 0 && (
            <section className="mt-7">
              <h2 className="mb-1 text-[15px] font-semibold">{t.guest.wines.alsoGood}</h2>
              {rest.map((i) => <WineRow key={i.wine.id} item={i} href={wineHref(i.wine.id)} serving={prefs.serving} showScores={showScores} t={t} locale={locale} />)}
            </section>
          )}
          <RecoFooter director={restaurant.wineDirector} restaurant={restaurant.name} showUnreviewed={showUnreviewed} howHref={href(`/r/${slug}/how-it-works`, prefs)} t={t} />
        </>
      )}
    </main>
  );

  const aside = menu && (
    <div className="px-5 pt-2 pb-8">
      <DishList dishes={menu.dishes} coverage={coverage} currentId={dish.id} stickyTop="top-0" compact t={t} locale={locale} hrefFor={(d) => href(`/r/${slug}/dish/${d.id}/wines`, prefs)} />
    </div>
  );

  // opening or closing the filters sheet is not a new view of the wines: only the list without the sheet counts (Q7)
  await trackUsage(services, restaurant, session, sheetOpen ? [] : [{
    name: 'recommendations_viewed', dishId: dish.id,
    props: { wineIds: result.items.map((i) => i.wine.id), items: result.items.map((i) => ({ wineId: i.wine.id, tier: usageTier(i) })), prefs: prefsToQuery(prefs) }
  }]);
  return (
    <>
      <TopBar
        back={href(`/r/${slug}/menu`, prefs)}
        title={restaurant.name}
        t={t}
        langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(path)} t={t} />}
        right={
          <Link href={filtersHref} scroll={false} aria-label={t.guest.wines.refine} className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M6 10h8M8.5 15h3" /></svg>
          </Link>
        }
      />
      <GuestColumns main={main} aside={aside} asideLabel={t.guest.menu.aside} />

      {sheetOpen && (
        <>
          <Link href={href(path, prefs)} scroll={false} aria-label={t.guest.wines.closeFilters} className="fixed inset-0 z-40 bg-ink/40" />
          <section role="dialog" aria-modal="true" aria-labelledby="sheet-title" className="fixed bottom-0 left-1/2 z-50 max-h-[88dvh] w-full max-w-[480px] -translate-x-1/2 overflow-auto rounded-t-[22px] bg-surface px-5 pt-3 pb-[calc(18px+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(34,24,29,0.16)] lg:top-0 lg:right-0 lg:bottom-auto lg:left-auto lg:h-dvh lg:max-h-none lg:w-[420px] lg:max-w-none lg:translate-x-0 lg:rounded-none lg:px-7 lg:pt-6 lg:shadow-[-12px_0_40px_rgba(34,24,29,0.16)]">
            <div className="mx-auto mb-3.5 h-1 w-9 rounded bg-[#d4ccd0] lg:hidden" />
            <header className="flex items-center justify-between">
              <h2 id="sheet-title" className="font-serif text-2xl">{t.guest.wines.refine}</h2>
              <Link href={href(path, prefs)} scroll={false} aria-label={t.common.close} className="grid size-11 place-items-center rounded-full hover:bg-ink/5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
              </Link>
            </header>
            <PrefChips prefs={prefs} hrefFor={(p) => href(path, p, { sheet: 'filters' })} full t={t} locale={locale} />
            <Explain id="filters" tone="sheet" className="mt-4" summary={ex.filters.summary} points={ex.filters.points(ENGINE_FACTS)} />
            <footer className="sticky bottom-0 mt-5 grid grid-cols-[auto_1fr] gap-2.5 bg-surface pt-4">
              <Button href={href(path, DEFAULT_PREFS, { sheet: 'filters' })} variant="secondary">{t.guest.wines.reset}</Button>
              <Button href={href(path, prefs)}>{t.guest.wines.show(result.items.length)}</Button>
            </footer>
          </section>
        </>
      )}
    </>
  );
}
