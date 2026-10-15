import type { Metadata } from 'next';
import { Button, DishList, GuestColumns, LanguageSwitch } from '../../_components/guest-ui';
import { RestaurantHero, WineDirectorNote } from '../../_components/restaurant-hero';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.catalogService.publishedMenu(slug);
  return { title: menu?.restaurant.name ?? (await getI18n()).t.guest.meta.menu };
}

/**
 * G0 — what the QR code opens: the restaurant's header with the menu right under it, so a guest is
 * one tap from the wines for their dish. On desktop the header is the left column. The language switch
 * sits top right in the header (there is no top bar here).
 */
export default async function LandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services, t, locale, href, langHrefs } = await guestContext(searchParams);
  const { catalogService } = services;
  const menu = await catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const r = menu.restaurant;
  const hasMenu = menu.dishes.length > 0;
  const coverage = hasMenu ? await catalogService.pairingCoverage(r.id) : new Map<string, { hasPrimary: boolean }>();
  const tableAction = <Button href={href(`/r/${r.slug}/table`, prefs)} variant="ghost" className="mt-8 w-full lg:w-auto">{t.guest.hero.tableAction}</Button>;
  const staffHref = href(`/r/${r.slug}/staff`);
  const langSwitch = <LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${r.slug}`)} t={t} tone="light" />;

  const main = (
    <main className="flex flex-1 flex-col">
      <div className="lg:hidden"><RestaurantHero restaurant={r} actions={hasMenu ? tableAction : undefined} short t={t} langSwitch={langSwitch} /></div>
      <div id="menu" className="scroll-mt-4 px-5 pt-6 pb-10 lg:pt-10">
        {hasMenu ? (
          <>
            <h2 className="font-serif text-[28px] leading-tight">{t.guest.landing.pickDish}</h2>
            <p className="mt-1 text-ink-2">{t.guest.landing.pickDishLead}</p>
            <DishList dishes={menu.dishes} coverage={coverage} stickyTop="top-0" t={t} locale={locale} hrefFor={(d) => href(`/r/${r.slug}/dish/${d.id}/wines`, prefs)} />
          </>
        ) : (
          <p className="rounded-xl bg-brass-soft px-4 py-3 text-[15px] text-[#5d4720]">{t.guest.landing.menuUpdating}</p>
        )}
        <div className="mt-10 lg:hidden"><WineDirectorNote restaurant={r} staffHref={staffHref} t={t} /></div>
      </div>
    </main>
  );

  return (
    <GuestColumns
      main={main}
      asideLabel={t.guest.hero.restaurant}
      underTopBar={false}
      aside={<RestaurantHero restaurant={r} actions={hasMenu ? tableAction : undefined} t={t} staffHref={staffHref} langSwitch={langSwitch} />}
    />
  );
}
