import type { Metadata } from 'next';
import { Button, DishList, Explain, GuestColumns, LanguageSwitch } from '../../_components/guest-ui';
import { RestaurantHero, WineDirectorNote } from '../../_components/restaurant-hero';
import { canPairTable, DEFAULT_PREFS, DEFAULT_RESTAURANT_SETTINGS, ENGINE_FACTS } from '@wine-match/core';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.catalogService.publishedMenu(slug);
  return { title: menu?.restaurant.name ?? (await getI18n()).t.guest.meta.menu };
}

/**
 * G0 — what the QR code opens: the restaurant's header with the menu right under it, so a guest is
 * one tap from the wines for their dish; above the menu the "Whole table" card (spec whole-table-waiter-path, R8). On desktop the header is the left column. The language switch
 * sits top right in the header (there is no top bar here). "How do we pick your wine?" sits under "Pick your dish"
 * (spec 2026-10-16-how-it-works-explanations, phase 2; none without a published menu), and the link to the "How we pick
 * your wine" page (G12) sits beside the staff link — under the menu on the phone, in the header on desktop.
 */
export default async function LandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services, t, locale, lang, session, href, langHrefs } = await guestContext(searchParams, { source: 'qr' });
  const { catalogService } = services;
  const menu = await catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  const r = menu.restaurant;
  const hasMenu = menu.dishes.length > 0;
  const coverage = hasMenu ? await catalogService.pairingCoverage(r.id) : new Map<string, { hasPrimary: boolean }>();
  const tableHref = href(`/r/${r.slug}/table`, prefs);
  // "Whole table" is a headline feature (D15): a card above the menu when the menu has a table to pair (R8); the quiet
  // button in the header stays only without the card (e.g. a menu of desserts), so there is one way in, not two
  const tableCard = hasMenu && canPairTable(menu.dishes);
  const tableAction = hasMenu && !tableCard ? <Button href={tableHref} variant="ghost" className="mt-8 w-full lg:w-auto">{t.guest.hero.tableAction}</Button> : undefined;
  // "For staff" is the one guest link without the guest's `sid`: the staff lookup keeps its own session (Q9)
  const staffHref = hrefWith(`/r/${r.slug}/staff`, DEFAULT_PREFS, {}, { lang });
  // "How we pick your wine" (G12), with the guest's `lang` and `sid` like every other guest link
  const howHref = href(`/r/${r.slug}/how-it-works`, prefs);
  // live settings, like G3 (not from the published snapshot)
  const { showScores, showUnreviewed } = r.settings ?? DEFAULT_RESTAURANT_SETTINGS;
  const langSwitch = <LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${r.slug}`)} t={t} tone="light" />;

  const main = (
    <main className="flex flex-1 flex-col">
      <div className="lg:hidden"><RestaurantHero restaurant={r} actions={tableAction} short t={t} langSwitch={langSwitch} /></div>
      <div id="menu" className="scroll-mt-4 px-5 pt-6 pb-10 lg:pt-10">
        {hasMenu ? (
          <>
            {tableCard && (
              <section aria-labelledby="table-card" className="mb-8 grid gap-3 rounded-2xl border border-line bg-surface p-5">
                <h2 id="table-card" className="font-serif text-h2 leading-tight">{t.guest.landing.tableCardTitle}</h2>
                <p className="text-body leading-snug text-ink-2">{t.guest.landing.tableCardText}</p>
                <Button href={tableHref} className="w-full sm:w-auto sm:justify-self-start">{t.guest.landing.tableCardAction}</Button>
              </section>
            )}
            <h2 className="font-serif text-h1 leading-tight">{t.guest.landing.pickDish}</h2>
            <p className="mt-1 text-ink-2">{t.guest.landing.pickDishLead}</p>
            <Explain id="landing" className="mt-1" summary={t.guest.explain.landing.summary} points={t.guest.explain.landing.points(ENGINE_FACTS, { showScores, showUnreviewed, director: r.wineDirector, restaurant: r.name })} />
            <DishList dishes={menu.dishes} coverage={coverage} stickyTop="top-0" t={t} locale={locale} hrefFor={(d) => href(`/r/${r.slug}/dish/${d.id}/wines`, prefs)} />
          </>
        ) : (
          <p className="rounded-xl bg-brass-soft px-4 py-3 text-body text-[#5d4720]">{t.guest.landing.menuUpdating}</p>
        )}
        <div className="mt-10 lg:hidden"><WineDirectorNote restaurant={r} howHref={howHref} staffHref={staffHref} t={t} /></div>
      </div>
    </main>
  );

  // G0 opens a QR session; it shows the menu when there is one (spec guest-short-path-and-desktop, A7)
  await trackUsage(services, r, session, hasMenu ? [{ name: 'menu_viewed' }] : []);
  return (
    <GuestColumns
      main={main}
      asideLabel={t.guest.hero.restaurant}
      underTopBar={false}
      aside={<RestaurantHero restaurant={r} actions={tableAction} t={t} staffHref={staffHref} howHref={howHref} langSwitch={langSwitch} />}
    />
  );
}
