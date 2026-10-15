import type { Metadata } from 'next';
import { DishList, GuestColumns, ModeSwitch, TopBar } from '../../../_components/guest-ui';
import { RestaurantHero } from '../../../_components/restaurant-hero';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Menu' };

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

/** G1 — dish list. A dish opens its wines directly; the guest's preferences travel in the links. */
export default async function MenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services } = await guestContext(searchParams);
  const { catalogService } = services;
  const menu = await catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const coverage = await catalogService.pairingCoverage(menu.restaurant.id);

  const main = (
    <main className="flex-1 px-5 pt-5 pb-8">
      <ModeSwitch dishHref={hrefWith(`/r/${slug}/menu`, prefs)} tableHref={hrefWith(`/r/${slug}/table`, prefs)} mode="dish" />
      {menu.dishes.length === 0 ? (
        <div className="py-12 text-center">
          <h2 className="font-serif text-2xl">Tonight’s menu is being updated</h2>
          <p className="mt-2 text-ink-2">Your waiter can suggest a wine in the meantime.</p>
        </div>
      ) : (
        <>
          <p className="text-ink-2">Pick the dish you’re ordering.</p>
          <DishList dishes={menu.dishes} coverage={coverage} hrefFor={(d) => hrefWith(`/r/${slug}/dish/${d.id}/wines`, prefs)} />
        </>
      )}
    </main>
  );

  return (
    <>
      <TopBar back={hrefWith(`/r/${slug}`, prefs)} title={menu.restaurant.name} />
      <GuestColumns main={main} asideLabel="Restaurant" aside={<RestaurantHero restaurant={menu.restaurant} compact />} />
    </>
  );
}
