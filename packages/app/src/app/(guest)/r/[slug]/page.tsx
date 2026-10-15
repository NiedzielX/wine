import type { Metadata } from 'next';
import { Button, DishList, GuestColumns } from '../../_components/guest-ui';
import { RestaurantHero, WineDirectorNote } from '../../_components/restaurant-hero';
import { guestContext, hrefWith, notFound, type SearchParams } from '@/server/guest-page';
import { getRequestScope } from '@/server/request-scope';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await (await getRequestScope()).cradle.catalogService.publishedMenu(slug);
  return { title: menu?.restaurant.name ?? 'Menu' };
}

/**
 * G0 — what the QR code opens: the restaurant's header with the menu right under it, so a guest is
 * one tap from the wines for their dish. On desktop the header is the left column.
 */
export default async function LandingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { prefs, services } = await guestContext(searchParams);
  const { catalogService } = services;
  const menu = await catalogService.publishedMenu(slug);
  if (!menu) notFound();
  const r = menu.restaurant;
  const hasMenu = menu.dishes.length > 0;
  const coverage = hasMenu ? await catalogService.pairingCoverage(r.id) : new Map<string, { hasPrimary: boolean }>();
  const tableAction = <Button href={hrefWith(`/r/${r.slug}/table`, prefs)} variant="ghost" className="mt-8 w-full lg:w-auto">Pair a bottle for the table</Button>;

  const main = (
    <main className="flex flex-1 flex-col">
      <div className="lg:hidden"><RestaurantHero restaurant={r} actions={hasMenu ? tableAction : undefined} short /></div>
      <div id="menu" className="scroll-mt-4 px-5 pt-6 pb-10 lg:pt-10">
        {hasMenu ? (
          <>
            <h2 className="font-serif text-[28px] leading-tight">Pick your dish</h2>
            <p className="mt-1 text-ink-2">We’ll show the wines from our list that go with it.</p>
            <DishList dishes={menu.dishes} coverage={coverage} stickyTop="top-0" hrefFor={(d) => hrefWith(`/r/${r.slug}/dish/${d.id}/wines`, prefs)} />
          </>
        ) : (
          <p className="rounded-xl bg-brass-soft px-4 py-3 text-[15px] text-[#5d4720]">Tonight’s menu is being updated. Your waiter can suggest a wine in the meantime.</p>
        )}
        <div className="mt-10 lg:hidden"><WineDirectorNote restaurant={r} /></div>
      </div>
    </main>
  );

  return (
    <GuestColumns
      main={main}
      asideLabel="Restaurant"
      underTopBar={false}
      aside={<RestaurantHero restaurant={r} actions={hasMenu ? tableAction : undefined} />}
    />
  );
}
