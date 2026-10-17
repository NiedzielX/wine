import type { Metadata } from 'next';
import { DishList, GuestColumns, LanguageSwitch, ModeSwitch, TopBar } from '../../../_components/guest-ui';
import { RestaurantHero } from '../../../_components/restaurant-hero';
import { guestContext, notFound, type SearchParams } from '@/server/guest-page';
import { getI18n } from '@/server/i18n';
import { trackUsage } from '@/server/usage-events';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.guest.meta.menu };
}

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/** G1 — dish list. A dish opens its wines directly; the guest's preferences travel in the links. */
export default async function MenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services, t, locale, session, href, langHrefs } = await guestContext(searchParams);
  const { catalogService } = services;
  const menu = await catalogService.publishedMenu(slug, locale);
  if (!menu) notFound();
  const coverage = await catalogService.pairingCoverage(menu.restaurant.id);

  const main = (
    <main className="flex-1 px-5 pt-5 pb-8">
      <ModeSwitch dishHref={href(`/r/${slug}/menu`, prefs)} tableHref={href(`/r/${slug}/table`, prefs)} mode="dish" t={t} />
      {menu.dishes.length === 0 ? (
        <div className="py-12 text-center">
          <h2 className="font-serif text-2xl">{t.guest.menu.updatingTitle}</h2>
          <p className="mt-2 text-ink-2">{t.guest.menu.updatingText}</p>
        </div>
      ) : (
        <>
          <p className="text-ink-2">{t.guest.menu.pickLead}</p>
          <DishList dishes={menu.dishes} coverage={coverage} t={t} locale={locale} hrefFor={(d) => href(`/r/${slug}/dish/${d.id}/wines`, prefs)} />
        </>
      )}
    </main>
  );

  await trackUsage(services, menu.restaurant, session, [{ name: 'menu_viewed' }]);
  return (
    <>
      <TopBar back={href(`/r/${slug}`, prefs)} title={menu.restaurant.name} t={t} langSwitch={<LanguageSwitch locale={locale} hrefs={langHrefs(`/r/${slug}/menu`)} t={t} />} />
      <GuestColumns main={main} asideLabel={t.guest.hero.restaurant} aside={<RestaurantHero restaurant={menu.restaurant} compact t={t} />} />
    </>
  );
}
